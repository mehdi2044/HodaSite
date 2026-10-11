import { randomUUID } from "node:crypto";
import sharp from "sharp";
import Decimal from "decimal.js";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({
  customerId: "",
  cookies: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (key: string) =>
      state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined,
    set: (key: string, value: string) => state.cookies.set(key, value),
  }),
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () =>
    db.customer.findUnique({ where: { id: state.customerId } }),
}));

import { db } from "@/lib/db";
import { tokenHash } from "@/lib/secure-tokens";
import { placeOrder, addressSchema } from "@/modules/checkout";
import { submitReceipt } from "@/modules/payments";
import {
  approvePayment,
  cancelOrder,
  cancelUnpaidOrders,
  transition,
} from "@/modules/orders/service";
import { requestReturn, manageReturn } from "@/modules/returns/service";
import { configSchema } from "@/modules/fitting/contracts";
import {
  walletView,
  createFittingSession,
  refundSession,
} from "@/modules/fitting";
import {
  lockWallet,
  grantCoins,
  creditPaidOrder,
  revokeReturnedCoins,
} from "@/modules/fitting/ledger";
import { returnFixture } from "../helpers/returns";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "cancelled exchange coin entitlement: PostgreSQL",
  () => {
    let ownerId: string, marketId: string;
    const pendingSessions: string[] = [];
    let original: Awaited<ReturnType<typeof db.integration.findUnique>>;
    beforeAll(async () => {
      ownerId = (
        await db.user.findFirstOrThrow({
          where: { roles: { some: { role: { key: "owner" } } } },
        })
      ).id;
      marketId = (await db.market.findUniqueOrThrow({ where: { code: "TR" } }))
        .id;
      original = await db.integration.findUnique({
        where: { key: "fitting-room" },
      });
      vi.stubEnv("FITTING_OPENAI_API_KEY", "fixture-key-never-sent");
    });
    beforeEach(async () => {
      state.cookies.clear();
      const config = configSchema.parse({
        enabled: true,
        coinSalesEnabled: true,
        welcomeCoins: "0",
        dailyFreeUses: 0,
        dailyLimit: 0,
        globalDailyLimit: 10000,
        rewards: [{ marketId, spendAmount: "100", coins: "25" }],
        models: [
          {
            id: "woman",
            kind: "WOMAN",
            mediaId: "seed-fashion-v2-look-women-coat",
            label: { fa: "مدل", tr: "Model", en: "Model" },
            enabled: true,
          },
        ],
      });
      await db.integration.upsert({
        where: { key: "fitting-room" },
        create: {
          key: "fitting-room",
          provider: "openai",
          isActive: true,
          config,
        },
        update: { isActive: true, config },
      });
    });
    afterAll(async () => {
      if (original)
        await db.integration.update({
          where: { id: original.id },
          data: { config: original.config ?? {}, isActive: original.isActive },
        });
      else await db.integration.deleteMany({ where: { key: "fitting-room" } });
      vi.unstubAllEnvs();
    });
    afterEach(async () => {
      for (const id of pendingSessions.splice(0)) {
        await db.job.deleteMany({
          where: {
            type: "fitting-render",
            payload: { path: ["sessionId"], equals: id },
          },
        });
        await db.$transaction((tx) => refundSession(tx, id, "FIXTURE_CLEANUP"));
      }
    });
    async function exchange(
      order: { id: string; customerId: string; items: { id: string }[] },
      variantId: string,
      quantity = 1,
    ) {
      const request = await requestReturn(order.customerId, {
        orderId: order.id,
        requestKey: randomUUID(),
        type: "EXCHANGE",
        reasonCode: "SIZE",
        items: [
          {
            orderItemId: order.items[0].id,
            quantity,
            exchangeVariantId: variantId,
          },
        ],
      });
      await manageReturn(ownerId, {
        returnId: request.id,
        version: 0,
        operation: "APPROVE",
      });
      const item = await db.returnItem.findFirstOrThrow({
        where: { returnRequestId: request.id },
      });
      await manageReturn(ownerId, {
        returnId: request.id,
        version: 1,
        operation: "RECEIVE",
        conditions: [{ itemId: item.id, condition: "RESTOCK" }],
      });
      const settled = await manageReturn(ownerId, {
        returnId: request.id,
        version: 2,
        operation: "EXCHANGE",
      });
      return db.order.findUniqueOrThrow({
        where: { id: settled.exchangeOrderId! },
        include: { items: true },
      });
    }
    async function actualPackSale() {
      const customer = await db.customer.create({
        data: { email: `pack-${randomUUID()}@example.com`, isGuest: false },
      });
      const f = await returnFixture(db, {
        customerId: customer.id,
        pending: true,
        quantity: 1,
        price: "100",
        replacementPrice: "200",
        coinPackCoins: "100",
      });
      // The return-only helper does not publish its fixture in any market.
      // This sale must pass the same public eligibility checks as checkout.
      await db.product.update({
        where: { id: f.variants[0].productId },
        data: { marketIds: [marketId] },
      });
      const token = randomUUID();
      state.customerId = f.customer.id;
      state.cookies.set("hoda.cart", token);
      state.cookies.set("market", "TR");
      const cart = await db.cart.create({
        data: {
          tokenHash: tokenHash(token),
          customerId: f.customer.id,
          marketId,
          locale: "en",
          currency: "TRY",
          expiresAt: new Date(Date.now() + 86400000),
          items: { create: { variantId: f.variants[0].id, quantity: 1 } },
        },
      });
      const address = addressSchema.parse({
        firstName: "Test",
        lastName: "Buyer",
        email: f.customer.email,
        phone: "+90 555 000 0000",
        country: "TR",
        province: "İstanbul",
        city: "Kadıköy",
        line1: "Example Street 10",
      });
      const placed = await placeOrder(
        address,
        true,
        cart.revision,
        undefined,
        false,
        "en",
      );
      const order = await db.order.findUniqueOrThrow({
        where: { number: placed.number },
        include: { items: true },
      });
      expect((await walletView(f.customer.id)).balance).toBe("0");
      const png = await sharp({
        create: { width: 8, height: 8, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
      await submitReceipt(
        order.number,
        new File([new Uint8Array(png)], "receipt.png", { type: "image/png" }),
        "fixture",
        "test",
      );
      await approvePayment(order.id, ownerId);
      await approvePayment(order.id, ownerId);
      expect((await walletView(f.customer.id)).balance).toBe("100");
      await db.$transaction(async (tx) => {
        for (const [from, to] of [
          ["PAID", "PROCESSING"],
          ["PROCESSING", "SHIPPED"],
          ["SHIPPED", "DELIVERED"],
        ] as const)
          await transition(tx, { id: order.id, status: from }, to, ownerId);
      });
      return {
        ...f,
        order: await db.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { items: true },
        }),
      };
    }
    it.each([false, true])(
      "actual checkout/payment and repeated manual cancellation; spent=%s",
      async (spent) => {
        const f = await actualPackSale();
        if (spent) {
          const session = await createFittingSession(
            f.customer.id,
            marketId,
            "en",
            {
              requestKey: randomUUID(),
              modelId: "woman",
              variantIds: ["seed-style-v2-women-tee-m"],
              expectedCostCoins: "12.5",
              confirm: true,
            },
          );
          pendingSessions.push(session.id);
        }
        const child = await exchange(f.order, f.variants[1].id);
        expect(child.status).toBe("PENDING_PAYMENT");
        await Promise.all([
          cancelOrder(child.id, "fixture", ownerId),
          cancelOrder(child.id, "fixture", ownerId),
        ]);
        expect(await walletView(f.customer.id)).toMatchObject({
          balance: "0",
          debt: spent ? "12.5" : "0",
        });
        const credit = await db.storeCredit.findFirstOrThrow({
          where: { customerId: f.customer.id },
        });
        expect(credit.balance.toString()).toBe("100");
        expect(
          await db.creditUse.count({
            where: { orderId: child.id, status: "RELEASED" },
          }),
        ).toBe(1);
        expect(
          await db.fittingCoinEntry.count({
            where: { customerId: f.customer.id, reason: "RETURN_REVERSAL" },
          }),
        ).toBe(1);
        expect(
          await db.fittingCoinGrant.count({ where: { orderId: child.id } }),
        ).toBe(0);
        if (spent) {
          await db.$transaction(async (tx) => {
            await lockWallet(tx, f.customer.id);
            await grantCoins(
              tx,
              f.customer.id,
              "after-cancellation",
              "MANUAL",
              "20",
            );
          });
          expect(await walletView(f.customer.id)).toMatchObject({
            balance: "7.5",
            debt: "0",
          });
        }
      },
    );
    it("deadline cancellation releases credit and reverses the source pack once", async () => {
      const f = await actualPackSale(),
        child = await exchange(f.order, f.variants[1].id);
      await db.order.update({
        where: { id: child.id },
        data: { paymentDeadlineAt: new Date(Date.now() - 1000) },
      });
      await cancelUnpaidOrders();
      await cancelUnpaidOrders();
      expect(
        await db.order.findUniqueOrThrow({ where: { id: child.id } }),
      ).toMatchObject({ status: "CANCELLED", paidAt: null });
      expect(await walletView(f.customer.id)).toMatchObject({
        balance: "0",
        debt: "0",
      });
      expect(
        (
          await db.storeCredit.findFirstOrThrow({
            where: { customerId: f.customer.id },
          })
        ).balance.toString(),
      ).toBe("100");
      expect(
        await db.fittingCoinEntry.count({
          where: { customerId: f.customer.id, reason: "RETURN_REVERSAL" },
        }),
      ).toBe(1);
    });
    it.each([false, true])(
      "partial source reversal through nested cancelled exchange; pack=%s",
      async (pack) => {
        const f = await returnFixture(db, {
          customerId: (
            await db.customer.create({
              data: {
                email: `nested-${randomUUID()}@example.com`,
                isGuest: false,
              },
            })
          ).id,
          quantity: 3,
          price: "100",
          ...(pack ? { coinPackCoins: "100" } : {}),
        });
        await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
        const child = await exchange(f.order, f.variants[1].id, 2);
        expect(child.status).toBe("PAID");
        expect((await walletView(f.customer.id)).balance).toBe(
          pack ? "300" : "75",
        );
        await db.order.update({
          where: { id: child.id },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
        await db.marketPrice.updateMany({
          where: { variantId: f.variants[0].id, marketId },
          data: { amount: "200" },
        });
        const grandchild = await exchange(child, f.variants[0].id);
        expect(grandchild.status).toBe("PENDING_PAYMENT");
        await cancelOrder(grandchild.id, "nested fixture", ownerId);
        await db.$transaction((tx) => revokeReturnedCoins(tx, child.id));
        await db.$transaction((tx) => revokeReturnedCoins(tx, grandchild.id));
        expect(await walletView(f.customer.id)).toMatchObject({
          balance: pack ? "200" : "50",
          debt: "0",
        });
        expect(
          await db.fittingCoinEntry.count({
            where: { customerId: f.customer.id, reason: "RETURN_REVERSAL" },
          }),
        ).toBe(1);
        expect(
          await db.fittingCoinGrant.count({
            where: { orderId: { in: [child.id, grandchild.id] } },
          }),
        ).toBe(0);
      },
    );
    it("reverses only the clothing reward for the directly cancelled returned quantity", async () => {
      const customer = await db.customer.create({
        data: { email: `partial-${randomUUID()}@example.com`, isGuest: false },
      });
      const f = await returnFixture(db, {
        customerId: customer.id,
        quantity: 3,
        price: "100",
        replacementPrice: "200",
      });
      await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
      const child = await exchange(f.order, f.variants[1].id);
      await cancelOrder(child.id, "partial clothing fixture", ownerId);
      await cancelOrder(child.id, "partial clothing replay", ownerId);
      expect(await walletView(customer.id)).toMatchObject({
        balance: "50",
        debt: "0",
      });
      const grant = await db.fittingCoinGrant.findFirstOrThrow({
        where: { orderId: f.order.id, reason: "PURCHASE" },
      });
      expect(grant.amount.toString()).toBe("75");
      expect(grant.revokedAmount.toString()).toBe("25");
      expect(
        (
          await db.storeCredit.findFirstOrThrow({
            where: { customerId: customer.id },
          })
        ).balance.toString(),
      ).toBe("100");
    });
    it.each(["cancel", "approve"] as const)(
      "serializes payment/cancellation with %s admitted first",
      async (first) => {
        const f = await actualPackSale(),
          child = await exchange(f.order, f.variants[1].id);
        let notifyAdmission!: () => void;
        const admitted = new Promise<void>((resolve) => {
          notifyAdmission = resolve;
        });
        // A held order row is a real PostgreSQL barrier. Queue the first operation
        // and prove it is blocked before queuing the competing operation.
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
          release = resolve;
        });
        const holder = db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${child.id} FOR UPDATE`;
            notifyAdmission();
            await released;
          },
          { timeout: 30000 },
        );
        await admitted;
        const act = (operation: "cancel" | "approve") =>
          operation === "cancel"
            ? cancelOrder(child.id, "race fixture", ownerId)
            : approvePayment(child.id, ownerId, true);
        const queuedFirst = act(first);
        let queuedSecond: ReturnType<typeof act>;
        try {
          await vi.waitFor(async () => {
            // Prisma parameterizes row locks; inspect the blocked order-lock
            // statement, while the fixture holds the only order lock in this spec.
            const locks = await db.$queryRaw<
              { count: bigint }[]
            >`SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "Order" WHERE id=%FOR UPDATE%'`;
            expect(locks[0].count).toBeGreaterThan(0n);
          });
          queuedSecond = act(first === "cancel" ? "approve" : "cancel");
        } finally {
          release();
        }
        await holder;
        const outcomes = await Promise.allSettled([queuedFirst, queuedSecond]);
        expect(outcomes[0].status).toBe("fulfilled");
        expect(outcomes[1].status).toBe("rejected");
        const final = await db.order.findUniqueOrThrow({
          where: { id: child.id },
        });
        expect(final.status).toBe(first === "cancel" ? "CANCELLED" : "PAID");
        expect((await walletView(f.customer.id)).balance).toBe(
          first === "cancel" ? "0" : "100",
        );
        expect(
          (
            await db.storeCredit.findFirstOrThrow({
              where: { customerId: f.customer.id },
            })
          ).balance.toString(),
        ).toBe(first === "cancel" ? "100" : "0");
        expect(
          await db.fittingCoinEntry.count({
            where: { customerId: f.customer.id, reason: "RETURN_REVERSAL" },
          }),
        ).toBe(first === "cancel" ? 1 : 0);
      },
    );
    it.each([101, 1000])(
      "walletView matches PostgreSQL SUM for %i maximum lots and does not mutate them",
      async (count) => {
        const c = await db.customer.create({
          data: {
            email: `balance-${randomUUID()}@example.com`,
            isGuest: false,
          },
        });
        await db.$transaction((tx) => lockWallet(tx, c.id));
        await db.fittingCoinGrant.createMany({
          data: Array.from({ length: count }, (_, i) => ({
            customerId: c.id,
            sourceKey: `large-${i}`,
            reason: "MANUAL",
            amount: "99999999999999.9999",
            balance: "99999999999999.9999",
          })),
        });
        const before = await db.fittingCoinGrant.findMany({
          where: { customerId: c.id },
          orderBy: { id: "asc" },
        });
        const [sum] = await db.$queryRaw<
          { balance: string }[]
        >`SELECT SUM(balance)::text AS balance FROM "FittingCoinGrant" WHERE "customerId"=${c.id}`;
        const view = await walletView(c.id);
        expect(view.balance).toBe(new Decimal(sum.balance).toFixed());
        expect(view).toMatchObject({ debt: "0", entries: [] });
        expect(
          await db.fittingCoinGrant.findMany({
            where: { customerId: c.id },
            orderBy: { id: "asc" },
          }),
        ).toEqual(before);
      },
    );
  },
);
