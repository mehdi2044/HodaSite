import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
const session = vi.hoisted(() => ({
  userId: null as string | null,
  customerId: null as string | null,
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () =>
    session.customerId ? { id: session.customerId } : null,
}));
import { db } from "@/lib/db";
import { requestReturn, manageReturn } from "@/modules/returns/service";
import { reserveCredit, consumeCredit, releaseCredit } from "@/modules/credits";
import { cancelOrder } from "@/modules/orders/service";
import { manageReturnAction } from "@/app/admin/(dashboard)/returns/actions";
import { requestReturnAction } from "@/app/[locale]/returns/actions";
import { returnFixture } from "../helpers/returns";
import { shippingActor, shippingForm } from "../helpers/shipping";
afterEach(() => {
  session.userId = null;
  session.customerId = null;
});
const input = (
  f: Awaited<ReturnType<typeof returnFixture>>,
  quantity = 1,
  exchange = false,
) => ({
  orderId: f.order.id,
  requestKey: randomUUID(),
  type: exchange ? "EXCHANGE" : "RETURN",
  reasonCode: "SIZE",
  items: [
    {
      orderItemId: f.order.items[0].id,
      quantity,
      ...(exchange ? { exchangeVariantId: f.variants[1].id } : {}),
    },
  ],
});
async function received(
  options: Parameters<typeof returnFixture>[1] = {},
  condition = "RESTOCK",
  exchange = false,
) {
  const f = await returnFixture(db, options),
    actor = await shippingActor(db);
  const request = await requestReturn(f.customer.id, input(f, 1, exchange));
  await manageReturn(actor.id, {
    returnId: request.id,
    version: 0,
    operation: "APPROVE",
  });
  const item = await db.returnItem.findFirstOrThrow({
    where: { returnRequestId: request.id },
  });
  await manageReturn(actor.id, {
    returnId: request.id,
    version: 1,
    operation: "RECEIVE",
    conditions: [{ itemId: item.id, condition }],
  });
  return { ...f, actor, request, item };
}
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "phase05 returns and store credit transactions",
  () => {
    it("idempotently creates one request, caps concurrent requests at the purchased quantity", async () => {
      const f = await returnFixture(db, { quantity: 1 }),
        v = input(f);
      const [a, b] = await Promise.all([
        requestReturn(f.customer.id, v),
        requestReturn(f.customer.id, v),
      ]);
      expect(a.id).toBe(b.id);
      await expect(requestReturn(f.customer.id, input(f))).rejects.toThrow(
        "RETURN_QUANTITY",
      );
      const g = await returnFixture(db, { quantity: 1 });
      const result = await Promise.allSettled([
        requestReturn(g.customer.id, input(g)),
        requestReturn(g.customer.id, input(g)),
      ]);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });
    it("does not reveal other customers' orders, and rejects forged customer action identities", async () => {
      const f = await returnFixture(db),
        g = await returnFixture(db);
      await expect(requestReturn(g.customer.id, input(f))).rejects.toThrow(
        "NOT_FOUND",
      );
      const form = shippingForm({
        orderId: f.order.id,
        orderItemId: f.order.items[0].id,
        quantity: "1",
        type: "RETURN",
        reasonCode: "SIZE",
        requestKey: randomUUID(),
        customerId: f.customer.id,
      });
      expect(await requestReturnAction(form)).toEqual({
        error: "LOGIN_REQUIRED",
      });
      session.customerId = g.customer.id;
      expect(await requestReturnAction(form)).toEqual({ error: "NOT_FOUND" });
    });
    it("rejects inactive customers and orders beyond the configured return window", async () => {
      const f = await returnFixture(db);
      await db.customer.update({
        where: { id: f.customer.id },
        data: { isActive: false },
      });
      await expect(requestReturn(f.customer.id, input(f))).rejects.toThrow(
        "NOT_FOUND",
      );
      await db.customer.update({
        where: { id: f.customer.id },
        data: { isActive: true },
      });
      await db.order.update({
        where: { id: f.order.id },
        data: { deliveredAt: new Date(0) },
      });
      await expect(requestReturn(f.customer.id, input(f))).rejects.toThrow(
        "RETURN_INELIGIBLE",
      );
    });
    it("rejected claims release eligibility, but their history cannot be changed", async () => {
      const f = await returnFixture(db, { quantity: 1 }),
        actor = await shippingActor(db);
      const r = await requestReturn(f.customer.id, input(f));
      await manageReturn(actor.id, {
        returnId: r.id,
        version: 0,
        operation: "REJECT",
        note: "Outside condition policy",
      });
      await expect(
        requestReturn(f.customer.id, input(f)),
      ).resolves.toBeDefined();
      await expect(
        db.returnRequest.update({
          where: { id: r.id },
          data: { status: "APPROVED", version: 2 },
        }),
      ).rejects.toThrow();
      await expect(
        db.returnRequest.delete({ where: { id: r.id } }),
      ).rejects.toThrow();
    });
    it.each(["RESTOCK", "QUARANTINE", "DAMAGED"])(
      "records %s exactly once, preserving the original cost lot",
      async (condition) => {
        const f = await received({}, condition);
        const stock = await db.stockItem.findUniqueOrThrow({
            where: { id: f.stocks[0].id },
          }),
          lot = await db.lot.findUniqueOrThrow({ where: { id: f.lots[0].id } });
        expect(stock.onHand).toBe(condition === "RESTOCK" ? 9 : 8);
        expect(lot.qtyRemaining).toBe(stock.onHand);
        expect(lot.unitCostAmount.toString()).toBe("2");
        const movements = await db.stockMovement.findMany({
          where: { referenceId: f.item.id },
        });
        expect(movements).toHaveLength(1);
        expect(movements[0].lotId).toBe(lot.id);
        await expect(
          manageReturn(f.actor.id, {
            returnId: f.request.id,
            version: 1,
            operation: "RECEIVE",
            conditions: [{ itemId: f.item.id, condition }],
          }),
        ).rejects.toThrow("RETURN_STALE");
      },
    );
    it("issues store credit once after receipt and retains the original order amount", async () => {
      const f = await received({ discount: "3" });
      const operation = {
        returnId: f.request.id,
        version: 2,
        operation: "CREDIT",
      };
      const results = await Promise.allSettled([
        manageReturn(f.actor.id, operation),
        manageReturn(f.actor.id, operation),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const credits = await db.storeCredit.findMany({
        where: { sourceReturnId: f.request.id },
      });
      expect(credits).toHaveLength(1);
      expect(credits[0].balance.toString()).toBe("8.5");
      expect(
        (
          await db.order.findUniqueOrThrow({ where: { id: f.order.id } })
        ).totalAmount.toString(),
      ).toBe("17");
      await expect(
        db.storeCredit.update({
          where: { id: credits[0].id },
          data: { amount: "100" },
        }),
      ).rejects.toThrow();
    });
    it("records a manual original-method refund once with the actual net amount", async () => {
      const f = await received();
      await manageReturn(f.actor.id, {
        returnId: f.request.id,
        version: 2,
        operation: "REFUND",
        note: "Transfer reference demo-123",
      });
      const rows = await db.refund.findMany({
        where: { returnRequestId: f.request.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].amount.toString()).toBe("10");
      expect(rows[0].method).toBe("OFFLINE_BANK_TRANSFER");
      await expect(
        db.refund.update({
          where: { id: rows[0].id },
          data: { amount: "100" },
        }),
      ).rejects.toThrow();
    });
    it("denies wrong-market or unauthenticated management, including forged direct actions", async () => {
      const f = await received(),
        ir = await db.market.findUniqueOrThrow({ where: { code: "IR" } }),
        actor = await shippingActor(db, "admin", ir.id);
      const v = { returnId: f.request.id, version: 2, operation: "CREDIT" };
      await expect(manageReturn(actor.id, v)).rejects.toThrow();
      const form = shippingForm({
        returnId: f.request.id,
        version: "2",
        operation: "CREDIT",
      });
      await expect(manageReturnAction(form)).rejects.toThrow();
      session.userId = actor.id;
      await expect(manageReturnAction(form)).rejects.toThrow();
      const warehouse = await shippingActor(db, "warehouse", f.market.id);
      await expect(manageReturn(warehouse.id, v)).rejects.toThrow();
      expect(
        await db.storeCredit.count({ where: { sourceReturnId: f.request.id } }),
      ).toBe(0);
    });
    it.each([
      ["10", "PAID", "0"],
      ["15", "PENDING_PAYMENT", "5"],
      ["5", "PAID", "5"],
    ])(
      "exchanges at %s with status %s and appropriate difference/credit",
      async (price, status, balance) => {
        const f = await received({ replacementPrice: price }, "RESTOCK", true);
        const resolved = await manageReturn(f.actor.id, {
          returnId: f.request.id,
          version: 2,
          operation: "EXCHANGE",
        });
        const order = await db.order.findUniqueOrThrow({
          where: { id: resolved.exchangeOrderId! },
          include: { payments: true, items: true },
        });
        expect(order.kind).toBe("EXCHANGE");
        expect(order.parentOrderId).toBe(f.order.id);
        expect(order.status).toBe(status);
        expect(order.totalAmount.toString()).toBe(price);
        expect(order.items[0].variantId).toBe(f.variants[1].id);
        const stock = await db.stockItem.findUniqueOrThrow({
          where: { id: f.stocks[1].id },
        });
        expect(stock.onHand).toBe(status === "PAID" ? 9 : 10);
        expect(stock.reserved).toBe(status === "PAID" ? 0 : 1);
        const credit = await db.storeCredit.findFirstOrThrow({
          where: { sourceReturnId: f.request.id },
        });
        expect(credit.balance.toString()).toBe(
          status === "PAID" ? balance : "0",
        );
        if (status !== "PAID")
          expect(
            order.payments
              .find((p) => p.status === "PENDING")!
              .amount.toString(),
          ).toBe(balance);
        else expect(order.payments[0].method).toBe("STORE_CREDIT");
      },
    );
    it("rolls back exchange credit and new order when replacement inventory is unavailable", async () => {
      const f = await received({}, "RESTOCK", true);
      await db.stockItem.update({
        where: { id: f.stocks[1].id },
        data: { onHand: 0 },
      });
      await expect(
        manageReturn(f.actor.id, {
          returnId: f.request.id,
          version: 2,
          operation: "EXCHANGE",
        }),
      ).rejects.toThrow();
      expect(
        await db.order.count({ where: { parentOrderId: f.order.id } }),
      ).toBe(0);
      expect(
        await db.storeCredit.count({ where: { sourceReturnId: f.request.id } }),
      ).toBe(0);
      expect(
        (
          await db.returnRequest.findUniqueOrThrow({
            where: { id: f.request.id },
          })
        ).status,
      ).toBe("RECEIVED");
    });
    it("serializes credit reservation between orders and releases cancelled orders only once", async () => {
      const f = await returnFixture(db, { pending: true }),
        g = await returnFixture(db, {
          pending: true,
          customerId: f.customer.id,
        });
      const credit = await db.storeCredit.create({
        data: {
          customerId: f.customer.id,
          currency: f.market.currency,
          amount: "10",
          balance: "10",
        },
      });
      const results = await Promise.all(
        [f, g].map((x) =>
          db.$transaction((tx) =>
            reserveCredit(
              tx,
              f.customer.id,
              x.order.id,
              f.market.currency,
              "20",
            ),
          ),
        ),
      );
      expect(results.map((x) => x.amount).sort()).toEqual(["0", "10"]);
      const reserved = await db.creditUse.findFirstOrThrow({
        where: { creditId: credit.id },
      });
      const actor = await shippingActor(db);
      await cancelOrder(reserved.orderId, "Test cancellation", actor.id);
      await cancelOrder(reserved.orderId, "Test cancellation", actor.id);
      expect(
        (
          await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })
        ).balance.toString(),
      ).toBe("10");
      expect(
        (await db.creditUse.findUniqueOrThrow({ where: { id: reserved.id } }))
          .status,
      ).toBe("RELEASED");
    });
    it("credit consumption produces a payment; release cannot refund consumed credit", async () => {
      const f = await returnFixture(db, { pending: true }),
        credit = await db.storeCredit.create({
          data: {
            customerId: f.customer.id,
            currency: f.market.currency,
            amount: "10",
            balance: "10",
          },
        });
      await db.$transaction(async (tx) => {
        await reserveCredit(
          tx,
          f.customer.id,
          f.order.id,
          f.market.currency,
          "20",
        );
        await consumeCredit(tx, f.order.id);
        await consumeCredit(tx, f.order.id);
        await releaseCredit(tx, f.order.id);
      });
      const payments = await db.payment.findMany({
        where: { orderId: f.order.id, method: "STORE_CREDIT" },
      });
      expect(payments).toHaveLength(1);
      expect(payments[0].amount.toString()).toBe("10");
      expect(
        (
          await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })
        ).balance.toString(),
      ).toBe("0");
    });
    it("database prevents associating another customer's credit with an order", async () => {
      const f = await returnFixture(db),
        g = await returnFixture(db),
        credit = await db.storeCredit.create({
          data: {
            customerId: f.customer.id,
            currency: f.market.currency,
            amount: "10",
            balance: "10",
          },
        });
      await expect(
        db.creditUse.create({
          data: { orderId: g.order.id, creditId: credit.id, amount: "10" },
        }),
      ).rejects.toThrow();
    });
  },
);
