import Decimal from "decimal.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const actor = vi.hoisted(() => ({
  id: "",
  customerId: null as string | null,
  cookies: new Map<string, string>(),
  requests: undefined as
    | import("node:async_hooks").AsyncLocalStorage<Map<string, string>>
    | undefined,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (k: string) => {
      const v = (actor.requests?.getStore() ?? actor.cookies).get(k);
      return v ? { value: v } : undefined;
    },
    set: (k: string, v: string) =>
      (actor.requests?.getStore() ?? actor.cookies).set(k, v),
  }),
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (actor.id ? { user: { id: actor.id } } : null),
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () =>
    actor.customerId
      ? db.customer.findUnique({ where: { id: actor.customerId } })
      : null,
}));
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/secure-tokens";
import { placeOrder, addressSchema } from "@/modules/checkout";
import { quoteCart } from "@/modules/fees";
import { receiveStock } from "@/modules/inventory";
import {
  saveCartCoupons,
  saveCheckout,
  changeCartMarket,
} from "@/modules/cart";
import {
  savePromotionProgram,
  issuePromotionCoupons,
} from "@/modules/promotions/server";
import { promotionOrderAmounts } from "@/modules/promotions";
import { approvePayment, cancelOrder } from "@/modules/orders/service";
import { requestReturn } from "@/modules/returns/service";
import { queueInvoice } from "@/modules/orders/invoices/queue";
import { saveProduct } from "@/app/admin/(dashboard)/catalog/products/actions";
import { configSchema } from "@/modules/fitting/contracts";
import { seedLedgerAccounts } from "../../prisma/ledger-seed";
import { promotionInput } from "../helpers/promotion-program";
actor.requests = new AsyncLocalStorage();
const programs: { raw: ReturnType<typeof promotionInput>; id: string }[] = [];
const feeIds: string[] = [];
const include = {
  items: true,
  fees: true,
  payments: true,
  promotionEvaluation: { include: { redemptions: true, release: true } },
} satisfies Prisma.OrderInclude;
async function fixture(locale: "fa" | "tr" | "en" = "tr", code = "TR") {
  const owner = await db.user.findUniqueOrThrow({
    where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
  });
  actor.id = owner.id;
  const market = await db.market.findUniqueOrThrow({ where: { code } });
  const source = await db.variant.findFirstOrThrow({
    include: { product: true },
  });
  const unique = randomUUID();
  const product = await db.product.create({
    data: {
      slugI18n: { en: unique, fa: unique, tr: unique },
      titleI18n: {
        en: "Promotion product",
        fa: "کالای تخفیف",
        tr: "İndirim ürünü",
      },
      descriptionI18n: {},
      categoryId: source.product.categoryId,
      gender: source.product.gender,
      status: "ACTIVE",
      marketIds: [market.id],
      basePriceAmount: "10",
    },
  });
  const variant = await db.variant.create({
    data: {
      productId: product.id,
      colorId: source.colorId,
      sizeId: source.sizeId,
      sku: `PROMO-${unique.toUpperCase()}`,
    },
  });
  await db.marketPrice.create({
    data: {
      marketId: market.id,
      variantId: variant.id,
      amount: "100",
      currency: market.currency,
    },
  });
  const warehouse = await db.warehouse.findFirstOrThrow();
  const { stock } = await receiveStock({
    warehouseId: warehouse.id,
    variantId: variant.id,
    quantity: 10,
    unitCostAmount: "1",
    unitCostCurrency: "TRY",
    unitCostAmountTry: "1",
    unitCostAmountUsd: "0.025",
    fxRateSnapshot: {
      currency: "TRY",
      rateTry: "1",
      rateUsd: "0.025",
      fxAsOf: new Date().toISOString(),
      effectiveAt: new Date().toISOString(),
    },
    receivedAt: new Date(),
  });
  const address = addressSchema.parse({
    firstName: "Test",
    lastName: "Buyer",
    email: `promotion-${unique}@example.com`,
    phone: "+90 555 000 0000",
    country: code,
    province: code === "CA" ? "ON" : "İstanbul",
    city: code === "CA" ? "Toronto" : "Kadıköy",
    postalCode: code === "CA" ? "M5V 2T6" : "34710",
    line1: "Example Street 10",
  });
  const token = randomUUID();
  actor.cookies.set("hoda.cart", token);
  actor.cookies.set("market", code);
  const cart = await db.cart.create({
    data: {
      tokenHash: tokenHash(token),
      marketId: market.id,
      locale,
      currency: market.currency,
      expiresAt: new Date(Date.now() + 86400000),
      checkout: address,
      items: { create: { variantId: variant.id, quantity: 1 } },
    },
  });
  return {
    market,
    product,
    variant,
    stock,
    address,
    cart,
    owner,
    token,
    locale,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function program(
  f: Fixture,
  change: Partial<ReturnType<typeof promotionInput>["config"]> = {},
) {
  const raw = promotionInput(f.market.id, f.product.id, change),
    saved = await savePromotionProgram(raw);
  programs.push({ raw, id: saved.id });
  const [coupon] = await issuePromotionCoupons({
    programId: saved.id,
    marketId: f.market.id,
    mutationKey: randomUUID(),
    confirmed: true,
    codes: [randomUUID().toUpperCase()],
    generateCount: 0,
    startsAt: "2020-01-01T00:00:00Z",
    endsAt: null,
    totalUsageCap: null,
    perCustomerCap: null,
  });
  return { raw, saved, coupon };
}
async function quote(
  f: Fixture,
  codes: string[] = [],
  customerId: string | null = actor.customerId,
) {
  return quoteCart({
    marketId: f.market.id,
    locale: f.locale,
    items: [{ variantId: f.variant.id, quantity: 1 }],
    address: f.address,
    promotions: { customerId, couponCodes: codes },
  });
}
async function place(f: Fixture, codes: string[] = []) {
  await saveCartCoupons(codes, 0);
  const q = await quote(f, codes),
    r = await placeOrder(f.address, true, 1, q.total);
  return {
    q,
    order: await db.order.findUniqueOrThrow({
      where: { number: r.number },
      include,
    }),
  };
}
async function customFees(f: Fixture, zero = false) {
  for (const [type, method, params] of [
    ["SHIPPING", "FIXED", { amount: zero ? "0" : "40" }],
    ["CUSTOMS", "FIXED", { amount: "0" }],
    ["SERVICE", "FIXED", { amount: "0" }],
    [
      "TAX",
      "PERCENT",
      { percent: zero ? "0" : "10", of: "subtotal_plus_shipping" },
    ],
  ] as const) {
    const row = await db.feeRule.create({
      data: {
        marketId: f.market.id,
        type,
        method,
        params,
        currency: f.market.currency,
        labelI18n: { en: type, tr: type, fa: type },
        province: f.address.province,
        city: f.address.city,
        postalPrefix: f.address.postalCode,
        categoryIds: [f.product.categoryId],
        priority: 99999,
        taxable: true,
        isActive: true,
        validFrom: new Date("2020-01-01"),
      },
    });
    feeIds.push(row.id);
  }
}
beforeEach(() => {
  actor.cookies.clear();
  actor.customerId = null;
});
afterEach(async () => {
  for (const p of programs.splice(0)) {
    const current = await db.promotionProgram.findUniqueOrThrow({
      where: { id: p.id },
    });
    await savePromotionProgram({
      ...p.raw,
      id: p.id,
      expectedVersion: current.version,
      mutationKey: randomUUID(),
      config: { ...p.raw.config, status: "ARCHIVED" },
    });
  }
  if (feeIds.length)
    await db.feeRule.deleteMany({ where: { id: { in: feeIds.splice(0) } } });
  await db.financeConfig.updateMany({
    where: { enabled: true },
    data: { enabled: false },
  });
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "09B real checkout integration",
  () => {
    it.each([
      ["CHECKOUT_FIRST", false],
      ["CHECKOUT_FIRST", true],
      ["ADMIN_FIRST", false],
      ["ADMIN_FIRST", true],
    ] as const)(
      "serializes %s with a coin-pack classification change (was pack: %s)",
      async (mode, wasPack) => {
        const f = await fixture();
        await customFees(f);
        const oldConfig = await db.integration.findUnique({
          where: { key: "fitting-room" },
        });
        await db.integration.upsert({
          where: { key: "fitting-room" },
          create: {
            key: "fitting-room",
            provider: "openai",
            isActive: true,
            config: configSchema.parse({
              enabled: true,
              coinSalesEnabled: true,
            }),
          },
          update: {
            isActive: true,
            config: configSchema.parse({
              enabled: true,
              coinSalesEnabled: true,
            }),
          },
        });
        await db.product.update({
          where: { id: f.product.id },
          data: { coinPackCoins: wasPack ? "100" : null },
        });
        actor.customerId = (
          await db.customer.create({
            data: { email: f.address.email, isGuest: false },
          })
        ).id;
        const form = new FormData();
        form.set("id", f.product.id);
        for (const locale of ["Fa", "Tr", "En"]) {
          form.set(`title${locale}`, "Test product");
          form.set(`description${locale}`, "Test product");
          form.set(`slug${locale}`, f.product.id);
        }
        form.set("categoryId", f.product.categoryId);
        form.set("gender", f.product.gender);
        form.set("status", "ACTIVE");
        form.set("basePriceAmount", f.product.basePriceAmount.toString());
        form.set("weightGrams", "200");
        form.append("marketIds", f.market.id);
        form.set("coinPackCoins", wasPack ? "" : "100");
        form.set(
          "variants",
          JSON.stringify([
            {
              id: f.variant.id,
              colorId: f.variant.colorId,
              sizeId: f.variant.sizeId,
              sku: f.variant.sku.toUpperCase(),
              isActive: true,
            },
          ]),
        );
        let ready!: () => void,
          release!: () => void,
          blockedPid = 0;
        const entered = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const realTransaction = db.$transaction.bind(db);
        const run = realTransaction as unknown as (
          fn: unknown,
          options?: unknown,
        ) => Promise<unknown>;
        db.$transaction = (async (fn: unknown, options?: unknown) => {
          if (typeof fn !== "function") return run(fn, options);
          return run(async (tx: Prisma.TransactionClient) => {
            const wrapped = new Proxy(tx, {
              get(target, key) {
                const isTarget =
                  mode === "CHECKOUT_FIRST"
                    ? key === "cart"
                    : key === "product";
                if (!isTarget) return Reflect.get(target, key, target);
                const delegate = Reflect.get(target, key, target);
                return new Proxy(delegate, {
                  get(d, method) {
                    const value = Reflect.get(d, method, d);
                    const wanted =
                      mode === "CHECKOUT_FIRST"
                        ? "findUniqueOrThrow"
                        : "update";
                    if (method !== wanted) return value;
                    return async (input: {
                      where?: { tokenHash?: string; id?: string };
                    }) => {
                      const result = await value.call(d, input);
                      if (
                        mode === "CHECKOUT_FIRST"
                          ? input.where?.tokenHash === tokenHash(f.token)
                          : input.where?.id === f.product.id
                      ) {
                        const [backend] = await tx.$queryRaw<
                          { pid: number }[]
                        >`SELECT pg_backend_pid() AS pid`;
                        blockedPid = backend.pid;
                        ready();
                        await gate;
                      }
                      return result;
                    };
                  },
                });
              },
            });
            return (
              fn as (client: Prisma.TransactionClient) => Promise<unknown>
            )(wrapped);
          }, options);
        }) as typeof db.$transaction;
        let purchase: ReturnType<typeof placeOrder> | undefined,
          edit: ReturnType<typeof saveProduct> | undefined;
        const checkout = () =>
          placeOrder(f.address, true, 0, undefined, false, f.locale);
        try {
          if (mode === "CHECKOUT_FIRST") purchase = checkout();
          else edit = saveProduct(null, form);
          await Promise.race([
            entered,
            (mode === "CHECKOUT_FIRST" ? purchase! : edit!).then((result) => {
              throw new Error(
                `Operation ended before the lock checkpoint: ${JSON.stringify(result)}`,
              );
            }),
          ]);
          if (mode === "CHECKOUT_FIRST") edit = saveProduct(null, form);
          else purchase = checkout();
          let blocked = false;
          const pattern =
            mode === "CHECKOUT_FIRST"
              ? "%Product%FOR UPDATE%"
              : "%FOR SHARE OF p%";
          for (let i = 0; i < 200 && !blocked; i++) {
            const [row] = await db.$queryRaw<{ blocked: boolean }[]>`
            SELECT EXISTS(SELECT 1 FROM pg_stat_activity
              WHERE ${blockedPid}=ANY(pg_blocking_pids(pid)) AND query LIKE ${pattern}) AS blocked`;
            blocked = row.blocked;
            if (!blocked)
              await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
          release();
          const [placed, changed] = await Promise.all([purchase!, edit!]);
          expect(changed).toMatchObject(
            mode === "CHECKOUT_FIRST"
              ? { ok: false, code: "VALIDATION" }
              : { ok: true },
          );
          const order = await db.order.findUniqueOrThrow({
            where: { number: placed.number },
            include,
          });
          const expectedPack = mode === "CHECKOUT_FIRST" ? wasPack : !wasPack;
          expect(
            typeof (order.items[0].productSnapshot as Prisma.JsonObject)
              .coinPackCoins === "string",
          ).toBe(expectedPack);
          expect(
            Boolean(
              (
                await db.product.findUniqueOrThrow({
                  where: { id: f.product.id },
                })
              ).coinPackCoins,
            ),
          ).toBe(expectedPack);
          expect(order.totalAmount.toString()).toBe((await quote(f)).total);
          if (expectedPack)
            expect(
              order.fees
                .filter(
                  (fee) => fee.type === "SHIPPING" || fee.type === "CUSTOMS",
                )
                .every((fee) => new Decimal(fee.amount.toString()).eq(0)),
            ).toBe(true);
        } finally {
          release();
          await Promise.allSettled([purchase, edit]);
          db.$transaction = realTransaction;
          if (oldConfig)
            await db.integration.update({
              where: { id: oldConfig.id },
              data: {
                config: oldConfig.config ?? {},
                isActive: oldConfig.isActive,
                provider: oldConfig.provider,
              },
            });
          else
            await db.integration.deleteMany({ where: { key: "fitting-room" } });
          await db.product.update({
            where: { id: f.product.id },
            data: { status: "ARCHIVED" },
          });
        }
      },
    );
    it("persists coupon state through address saves, rejects stale revision and clears codes on market change", async () => {
      const f = await fixture(),
        p = await program(f);
      await saveCartCoupons([p.coupon.code.toLowerCase()], 0);
      await saveCheckout({ ...f.address, couponCodes: ["FAKE"] });
      expect(
        (await db.cart.findUniqueOrThrow({ where: { id: f.cart.id } }))
          .checkout,
      ).toMatchObject({ couponCodes: [p.coupon.code] });
      await expect(saveCartCoupons([], 0)).rejects.toThrow("CART_CHANGED");
      actor.cookies.set("market", "CA");
      await db.product.update({
        where: { id: f.product.id },
        data: {
          marketIds: {
            push: (await db.market.findUniqueOrThrow({ where: { code: "CA" } }))
              .id,
          },
        },
      });
      await changeCartMarket("en");
      expect(
        (await db.cart.findUniqueOrThrow({ where: { id: f.cart.id } }))
          .checkout,
      ).toEqual({});
    });
    it("CA minimum-basket promotion does not cross market boundaries", async () => {
      const f = await fixture("en", "CA");
      const base = promotionInput(f.market.id, f.product.id);
      const p = await program(f, {
        definition: {
          ...base.config.definition,
          conditions: [
            { field: "market", value: f.market.id },
            { field: "subtotal", op: "gte", value: "100" },
          ],
        },
      });
      expect((await quote(f, [p.coupon.code])).discountTotal).toBe("10.0000");
      const tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
      await db.product.update({
        where: { id: f.product.id },
        data: { marketIds: { push: tr.id } },
      });
      expect(
        (
          await quoteCart({
            marketId: tr.id,
            locale: "tr",
            items: [{ variantId: f.variant.id, quantity: 1 }],
            promotions: { customerId: null, couponCodes: [p.coupon.code] },
          })
        ).discountTotal,
      ).toBe("0.0000");
    });
    it("uses the confirmed page locale after a shopper changes language", async () => {
      const f = await fixture("tr");
      const raw = promotionInput(f.market.id, f.product.id);
      const p = await program(f, {
        definition: {
          ...raw.config.definition,
          conditions: [{ field: "locale", value: "fa" }],
        },
      });
      await saveCartCoupons([p.coupon.code], 0);
      const q = await quoteCart({
        marketId: f.market.id,
        locale: "fa",
        items: [{ variantId: f.variant.id, quantity: 1 }],
        address: f.address,
        promotions: { customerId: null, couponCodes: [p.coupon.code] },
      });
      expect(q.discountTotal).toBe("10.0000");
      const placed = await placeOrder(f.address, true, 1, q.total, false, "fa");
      expect(placed.locale).toBe("fa");
      const order = await db.order.findUniqueOrThrow({
        where: { number: placed.number },
      });
      expect(order.discountAmount.toFixed(4)).toBe("10.0000");
    });
    it("commits net tax, immutable discounts and payment without changing unit price, and retries once", async () => {
      const f = await fixture();
      await customFees(f);
      const p = await program(f),
        shipping = await program(f, {
          definition: {
            ...p.raw.config.definition,
            effect: { type: "freeShipping" },
          },
        });
      const codes = [p.coupon.code, shipping.coupon.code];
      const { q, order } = await place(f, codes);
      expect(q.subtotal).toBe("100");
      expect(q.discountTotal).toBe("50.0000");
      expect(q.total).toBe("99");
      expect(q.lines.find((l) => l.type === "TAX")?.amount).toBe("9");
      expect(order.items[0].unitPriceAmount.toFixed(4)).toBe("100.0000");
      expect(order.payments[0].amount.toFixed(4)).toBe("99.0000");
      expect(order.promotionEvaluation?.redemptions).toHaveLength(2);
      expect(q).not.toHaveProperty("explanations");
      expect(q).not.toHaveProperty("programs");
      const again = await placeOrder(f.address, true, 0, "1");
      expect(again.number).toBe(order.number);
      expect(
        await db.promotionRedemption.count({
          where: { evaluationId: order.promotionEvaluation!.id },
        }),
      ).toBe(2);
    });
    it("quotes and stores tax without merchant-absorbed shipping", async () => {
      const f = await fixture();
      await customFees(f);
      await db.feeRule.updateMany({
        where: { id: { in: feeIds }, type: "SHIPPING" },
        data: { absorb: true },
      });
      const p = await program(f),
        shipping = await program(f, {
          definition: {
            ...p.raw.config.definition,
            effect: { type: "freeShipping" },
          },
        });
      const noCoupon = await quote(f);
      expect(noCoupon.lines.find((l) => l.type === "TAX")?.amount).toBe("10");
      expect(noCoupon.total).toBe("110");
      const { q, order } = await place(f, [
        p.coupon.code,
        shipping.coupon.code,
      ]);
      expect(q.lines.find((l) => l.type === "SHIPPING")).toMatchObject({
        amount: "40",
        chargedAmount: "0",
        absorbed: true,
      });
      expect(q.shippingDiscount).toBe("0.0000");
      expect(q.discountTotal).toBe("10.0000");
      expect(q.lines.find((l) => l.type === "TAX")?.amount).toBe("9");
      expect(q.total).toBe("99");
      expect(order.fees.find((l) => l.type === "TAX")?.amount.toFixed(4)).toBe(
        "9.0000",
      );
      expect(order.payments[0].amount.toFixed(4)).toBe("99.0000");
      expect(order.totalAmount.toFixed(4)).toBe("99.0000");
      expect(order.items[0].unitPriceAmount.toFixed(4)).toBe("100.0000");
      expect(order.promotionEvaluation?.redemptions).toHaveLength(1);
    });
    it("rolls back stale total before creating order, usage, payment or reservation", async () => {
      const f = await fixture(),
        p = await program(f);
      await saveCartCoupons([p.coupon.code], 0);
      const q = await quote(f, [p.coupon.code]);
      await savePromotionProgram({
        ...p.raw,
        id: p.saved.id,
        expectedVersion: 1,
        mutationKey: randomUUID(),
        config: { ...p.raw.config, status: "PAUSED" },
      });
      await expect(placeOrder(f.address, true, 1, q.total)).rejects.toThrow(
        "PRICE_CHANGED",
      );
      expect(await db.order.count({ where: { cartId: f.cart.id } })).toBe(0);
      expect(
        await db.promotionRedemption.count({
          where: { programId: p.saved.id },
        }),
      ).toBe(0);
      expect(
        (await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } }))
          .reserved,
      ).toBe(0);
    });
    it("two real checkouts cannot both redeem the last coupon; losing cart remains usable", async () => {
      const f = await fixture(),
        p = await program(f, { totalUsageCap: 1 });
      const codes = [p.coupon.code];
      await saveCartCoupons(codes, 0);
      const secondToken = randomUUID(),
        second = await db.cart.create({
          data: {
            tokenHash: tokenHash(secondToken),
            marketId: f.market.id,
            locale: f.locale,
            currency: f.market.currency,
            expiresAt: new Date(Date.now() + 86400000),
            checkout: { ...f.address, couponCodes: codes },
            items: { create: { variantId: f.variant.id, quantity: 1 } },
          },
        });
      const q = await quote(f, codes);
      const results = await Promise.allSettled([
        actor.requests!.run(new Map(actor.cookies), () =>
          placeOrder(f.address, true, 1, q.total),
        ),
        actor.requests!.run(
          new Map([
            ["hoda.cart", secondToken],
            ["market", "TR"],
          ]),
          () => placeOrder(f.address, true, 0, q.total),
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { message: "PRICE_CHANGED" },
      });
      expect(
        await db.order.count({
          where: { cartId: { in: [f.cart.id, second.id] } },
        }),
      ).toBe(1);
      expect(
        await db.promotionRedemption.count({
          where: { programId: p.saved.id },
        }),
      ).toBe(1);
      expect(
        (await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } }))
          .reserved,
      ).toBe(1);
      expect(
        await db.cart.count({
          where: { id: { in: [f.cart.id, second.id] }, completedAt: null },
        }),
      ).toBe(1);
    });
    it("unpaid cancellation releases capacity once, allowing a new quote", async () => {
      const f = await fixture(),
        p = await program(f, { totalUsageCap: 1 });
      const { order } = await place(f, [p.coupon.code]);
      expect((await quote(f, [p.coupon.code])).discountTotal).toBe("0.0000");
      await cancelOrder(order.id, "fixture", f.owner.id);
      await cancelOrder(order.id, "fixture", f.owner.id);
      expect(
        await db.promotionUsageRelease.count({
          where: { evaluationId: order.promotionEvaluation!.id },
        }),
      ).toBe(1);
      expect((await quote(f, [p.coupon.code])).discountTotal).toBe("10.0000");
    });
    it("authenticated first-market shopper qualifies; matching guest email cannot use customer-only coupon", async () => {
      const f = await fixture(),
        p = await program(f, { perCustomerCap: 1 });
      const c = await db.customer.create({
        data: { email: f.address.email, isGuest: false },
      });
      expect((await quote(f, [p.coupon.code], null)).discountTotal).toBe(
        "0.0000",
      );
      actor.customerId = c.id;
      expect((await quote(f, [p.coupon.code])).discountTotal).toBe("10.0000");
      const { order } = await place(f, [p.coupon.code]);
      expect(order.customerId).toBe(c.id);
      expect((await quote(f, [p.coupon.code])).discountTotal).toBe("0.0000");
    });
    it("refund budgets and balanced journals separate shipping discounts; paid usage remains consumed", async () => {
      const f = await fixture();
      await customFees(f);
      await seedLedgerAccounts(db);
      await db.financeConfig.upsert({
        where: { id: f.market.id },
        create: {
          id: f.market.id,
          enabled: true,
          enabledAt: new Date(Date.now() - 60000),
        },
        update: { enabled: true, enabledAt: new Date(Date.now() - 60000) },
      });
      const p = await program(f),
        s = await program(f, {
          definition: {
            ...p.raw.config.definition,
            effect: { type: "freeShipping" },
          },
        });
      const { order } = await place(f, [p.coupon.code, s.coupon.code]);
      await approvePayment(order.id, f.owner.id, true);
      const paid = await db.order.findUniqueOrThrow({
        where: { id: order.id },
        include,
      });
      expect(
        promotionOrderAmounts(paid)!.netItems.get(paid.items[0].id)?.toFixed(4),
      ).toBe("90.0000");
      const journals = await db.journalEntry.findMany({
        where: { memo: order.number },
        include: { lines: { include: { account: true } } },
      });
      const credit = (account: string) =>
        journals
          .flatMap((j) => j.lines)
          .filter((l) => l.account.code === account)
          .reduce((s, l) => s.add(l.credit.toString()), new Decimal(0));
      expect(credit("sales").toFixed(4)).toBe("90.0000");
      expect(credit("shipping_income").toFixed(4)).toBe("0.0000");
      expect(credit("tax_collected").toFixed(4)).toBe("9.0000");
      for (const j of journals)
        for (const [dr, cr] of [
          ["debit", "credit"],
          ["debitTry", "creditTry"],
          ["debitUsd", "creditUsd"],
        ] as const)
          expect(
            j.lines
              .reduce(
                (s, l) => s.add(l[dr].toString()).sub(l[cr].toString()),
                new Decimal(0),
              )
              .isZero(),
          ).toBe(true);
      await db.order.update({
        where: { id: order.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      const r = await requestReturn(order.customerId, {
        orderId: order.id,
        requestKey: randomUUID(),
        type: "RETURN",
        reasonCode: "SIZE",
        items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      });
      expect(r.refundAmount.toFixed(4)).toBe("90.0000");
      expect(
        await db.promotionUsageRelease.count({
          where: { evaluationId: order.promotionEvaluation!.id },
        }),
      ).toBe(0);
    });
    it.each(["fa", "tr", "en"] as const)(
      "%s invoice keeps original translated discount after editing the program",
      async (locale) => {
        const f = await fixture(locale),
          p = await program(f);
        const { order } = await place(f, [p.coupon.code]);
        await approvePayment(order.id, f.owner.id, true);
        const first = await db.invoice.findFirstOrThrow({
          where: { orderId: order.id },
        });
        await savePromotionProgram({
          ...p.raw,
          id: p.saved.id,
          expectedVersion: 1,
          mutationKey: randomUUID(),
          titleI18n: { fa: "جدید", tr: "Yeni", en: "New" },
        });
        const next = await db.$transaction((tx) =>
          queueInvoice(tx, order.id, f.owner.id, first.version),
        );
        expect((next.snapshot as Prisma.JsonObject).discounts).toEqual(
          (first.snapshot as Prisma.JsonObject).discounts,
        );
        expect((first.snapshot as Prisma.JsonObject).discounts).toEqual([
          expect.objectContaining({
            title: p.raw.titleI18n[locale],
            amount: "10.0000",
          }),
        ]);
      },
    );
    it("a fully discounted order reaches PAID with zero due and invoice, without negative sales", async () => {
      const f = await fixture();
      await customFees(f, true);
      const raw = promotionInput(f.market.id, f.product.id);
      const p = await program(f, {
        definition: {
          ...raw.config.definition,
          effect: { type: "percent", percent: "100" },
        },
      });
      const { order } = await place(f, [p.coupon.code]);
      expect(order.totalAmount.isZero()).toBe(true);
      expect(order.status).toBe("PAID");
      expect(order.payments).toHaveLength(0);
      expect(await db.invoice.count({ where: { orderId: order.id } })).toBe(1);
    });
  },
);
