import Decimal from "decimal.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({
  customerId: null as string | null,
  cookies: new Map<string, string>(),
  requests: undefined as
    | import("node:async_hooks").AsyncLocalStorage<Map<string, string>>
    | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      (context.requests?.getStore() ?? context.cookies).has(key)
        ? { value: (context.requests?.getStore() ?? context.cookies).get(key) }
        : undefined,
    set: (key: string, value: string) =>
      (context.requests?.getStore() ?? context.cookies).set(key, value),
  }),
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () =>
    context.customerId
      ? db.customer.findUnique({ where: { id: context.customerId } })
      : null,
}));
vi.mock("@/modules/integrations/storage", () => ({
  storage: { put: vi.fn(async () => ""), delete: vi.fn(async () => {}) },
}));
import { db } from "@/lib/db";
import { opaqueToken, tokenHash, unseal } from "@/lib/secure-tokens";
import { placeOrder, addressSchema } from "@/modules/checkout";
import { InsufficientOrderStock } from "@/modules/inventory/orders";
import { quoteCart } from "@/modules/fees";
import {
  receiveStock,
  expireReservations,
  reserveStock,
} from "@/modules/inventory";
import {
  approvePayment,
  rejectPayment,
  cancelUnpaidOrders,
  authorizedOrder,
} from "@/modules/orders";
import { submitReceipt } from "@/modules/payments";
import { requestCustomerOtp, verifyCustomerOtp } from "@/modules/customers/otp";

context.requests = new AsyncLocalStorage<Map<string, string>>();
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
async function fixture(quantity = 3) {
  const suffix = randomUUID(),
    market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  const source = await db.variant.findFirstOrThrow({
    include: { product: true },
  });
  const product = await db.product.create({
    data: {
      slugI18n: { en: suffix },
      titleI18n: { en: "Commerce test", tr: "Test", fa: "آزمایش" },
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
      sku: `TEST-${suffix}`,
    },
  });
  const warehouse = await db.warehouse.findFirstOrThrow();
  const { stock } = await receiveStock({
    warehouseId: warehouse.id,
    variantId: variant.id,
    quantity,
    unitCostAmount: "100",
    unitCostCurrency: "TRY",
    unitCostAmountTry: "100",
    unitCostAmountUsd: "2.5",
    fxRateSnapshot: { tryPerUsd: "40" },
    receivedAt: new Date(),
  });
  const token = opaqueToken();
  context.cookies.set("hoda.cart", token);
  context.cookies.set("market", "TR");
  const address = addressSchema.parse({
    firstName: "Test",
    lastName: "Buyer",
    email: `commerce-${suffix}@example.com`,
    phone: "+90 555 000 0000",
    country: "TR",
    province: "İstanbul",
    city: "Kadıköy",
    line1: "Example Street 10",
  });
  const cart = await db.cart.create({
    data: {
      tokenHash: tokenHash(token),
      marketId: market.id,
      locale: "tr",
      currency: "TRY",
      expiresAt: new Date(Date.now() + 86400000),
      checkout: address,
      items: { create: { variantId: variant.id, quantity: 1 } },
    },
  });
  const user = await db.user.findUniqueOrThrow({
    where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
  });
  return { market, variant, stock, address, cart, user };
}
async function placed() {
  const f = await fixture();
  const result = await placeOrder(f.address, true, 0);
  const order = await db.order.findUniqueOrThrow({
    where: { number: result.number },
    include: { items: true, fees: true, payments: true },
  });
  return { ...f, order };
}
const receipt = () =>
  new File(
    ["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"],
    "proof.pdf",
    { type: "application/pdf" },
  );
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "phase04-test-secret");
  vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
  context.cookies.clear();
  context.customerId = null;
});
afterEach(() => vi.unstubAllEnvs());

describe.skipIf(!hasDb)("phase 04 transactional commerce", () => {
  it.each([1, 2])(
    "handles concurrent checkout with %i units without customer creation races",
    async (quantity) => {
      const f = await fixture(quantity),
        firstCookies = new Map(context.cookies),
        secondToken = opaqueToken();
      const second = await db.cart.create({
        data: {
          tokenHash: tokenHash(secondToken),
          marketId: f.market.id,
          locale: "tr",
          currency: "TRY",
          expiresAt: new Date(Date.now() + 86400000),
          items: { create: { variantId: f.variant.id, quantity: 1 } },
        },
      });
      const results = await Promise.allSettled(
        [
          firstCookies,
          new Map([
            ["hoda.cart", secondToken],
            ["market", "TR"],
          ]),
        ].map((jar, index) =>
          context.requests!.run(jar, () =>
            placeOrder(
              {
                ...f.address,
                // Different buyers must compete on stock; the same new email must
                // also support two simultaneous purchases when stock is sufficient.
                email:
                  quantity === 1 && index === 1
                    ? `other-${f.address.email}`
                    : f.address.email,
              },
              true,
              0,
            ),
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(
        quantity,
      );
      if (quantity === 1) {
        const failure = results.find((r) => r.status === "rejected");
        expect(failure?.status).toBe("rejected");
        if (failure?.status === "rejected") {
          expect(
            failure.reason instanceof InsufficientOrderStock ||
              (failure.reason instanceof Error &&
                failure.reason.message.startsWith("Insufficient stock")),
          ).toBe(true);
        }
      } else {
        const orders = await db.order.findMany({
          where: { cartId: { in: [f.cart.id, second.id] } },
        });
        expect(new Set(orders.map((order) => order.customerId)).size).toBe(1);
        expect(
          await db.customer.count({ where: { email: f.address.email } }),
        ).toBe(1);
      }
      expect(
        await db.order.count({
          where: { cartId: { in: [f.cart.id, second.id] } },
        }),
      ).toBe(quantity);
      const stock = await db.stockItem.findUniqueOrThrow({
        where: { id: f.stock.id },
      });
      expect(stock.onHand).toBe(quantity);
      expect(stock.reserved).toBe(quantity);
    },
  );
  it("snapshots quote and FX; a retry creates neither a second order nor a second hold", async () => {
    const f = await fixture();
    const quote = await quoteCart({
      marketId: f.market.id,
      locale: "tr",
      items: [{ variantId: f.variant.id, quantity: 1 }],
      address: f.address,
    });
    const [a, b] = await Promise.all([
      placeOrder(f.address, true, 0),
      placeOrder(f.address, true, 0),
    ]);
    expect(a.number).toBe(b.number);
    const order = await db.order.findUniqueOrThrow({
      where: { number: a.number },
      include: { items: true, fees: true },
    });
    expect(order.totalAmount.toString()).toBe(quote.total);
    expect(order.items[0].unitPriceAmount.toString()).toBe(
      quote.items[0].unitPrice,
    );
    expect(
      await db.reservation.count({
        where: { orderId: order.id, status: "ACTIVE" },
      }),
    ).toBe(1);
    const before = JSON.stringify(order);
    const override = await db.fxOverride.create({
      data: {
        marketId: f.market.id,
        rate: "80",
        validFrom: new Date(Date.now() - 1000),
        note: "Test snapshot stability",
        createdBy: f.user.id,
      },
    });
    const rule = await db.feeRule.findFirst({
      where: { marketId: f.market.id },
    });
    try {
      if (rule)
        await db.feeRule.update({
          where: { id: rule.id },
          data: { isActive: !rule.isActive },
        });
      expect(
        JSON.stringify(
          await db.order.findUniqueOrThrow({
            where: { id: order.id },
            include: { items: true, fees: true },
          }),
        ),
      ).toBe(before);
    } finally {
      await db.fxOverride.delete({ where: { id: override.id } });
      if (rule)
        await db.feeRule.update({
          where: { id: rule.id },
          data: { isActive: rule.isActive },
        });
    }
    await expect(
      db.order.update({ where: { id: order.id }, data: { totalAmount: "1" } }),
    ).rejects.toThrow();
    await expect(
      db.orderItem.update({
        where: { id: order.items[0].id },
        data: { quantity: 2 },
      }),
    ).rejects.toThrow();
    await expect(
      db.order.delete({ where: { id: order.id } }),
    ).rejects.toThrow();
  });
  it("rejects stale cart revision, absent terms and a mismatching market before placing", async () => {
    const f = await fixture();
    await expect(placeOrder(f.address, false, 0)).rejects.toThrow(
      "TERMS_REQUIRED",
    );
    await expect(placeOrder(f.address, true, 1)).rejects.toThrow(
      "CART_CHANGED",
    );
    await expect(placeOrder(f.address, true, 0, "0")).rejects.toThrow(
      "PRICE_CHANGED",
    );
    context.cookies.set("market", "CA");
    await expect(placeOrder(f.address, true, 0)).rejects.toThrow(
      "MARKET_CHANGED",
    );
    expect(await db.order.count({ where: { cartId: f.cart.id } })).toBe(0);
  });
  it("reject → re-upload → parallel approve consumes exactly once and retains rejected evidence", async () => {
    const f = await placed();
    const first = await submitReceipt(f.order.number, receipt(), "", "ref-1");
    await rejectPayment(f.order.id, f.user.id, "Wrong reference");
    expect(
      (await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } }))
        .reserved,
    ).toBe(0);
    await submitReceipt(f.order.number, receipt(), "", "ref-2");
    expect(
      await Promise.all([
        approvePayment(f.order.id, f.user.id),
        approvePayment(f.order.id, f.user.id),
      ]),
    ).toEqual(["PAID", "PAID"]);
    const invoices = await db.invoice.findMany({
      where: { orderId: f.order.id },
    });
    expect(invoices).toHaveLength(1);
    expect(
      await db.job.count({
        where: {
          type: "invoice-generate",
          payload: { path: ["invoiceId"], equals: invoices[0].id },
        },
      }),
    ).toBe(1);
    const stock = await db.stockItem.findUniqueOrThrow({
      where: { id: f.stock.id },
    });
    expect(stock.onHand).toBe(2);
    expect(stock.reserved).toBe(0);
    expect(
      await db.stockMovement.count({
        where: { referenceId: f.order.id, type: "OUT" },
      }),
    ).toBe(1);
    const payments = await db.payment.findMany({
      where: { orderId: f.order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(payments.map((p) => p.status)).toEqual(["REJECTED", "APPROVED"]);
    const saved = await db.receipt.findUniqueOrThrow({ where: { id: first } });
    await expect(
      db.media.update({
        where: { id: saved.mediaId },
        data: { deletedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      db.payment.update({
        where: { id: payments[1].id },
        data: { amount: "0" },
      }),
    ).rejects.toThrow();
  });
  it("expired holds release stock; a submitted receipt cannot oversell another reservation", async () => {
    const f = await placed();
    await expireReservations(new Date(f.order.holdExpiresAt.getTime() + 1000));
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
    ).toBe("PENDING_PAYMENT");
    expect(
      (await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } }))
        .reserved,
    ).toBe(0);
    await reserveStock([
      {
        warehouseId: f.stock.warehouseId,
        variantId: f.variant.id,
        quantity: 3,
        kind: "VERIFICATION",
        referenceId: "other-buyer",
      },
    ]);
    await submitReceipt(f.order.number, receipt(), "", "");
    expect(await approvePayment(f.order.id, f.user.id)).toBe("NEEDS_REVIEW");
    expect(
      await db.stockMovement.count({
        where: { referenceId: f.order.id, type: "OUT" },
      }),
    ).toBe(0);
    expect(
      await db.systemAlert.count({
        where: { code: `ORDER_STOCK_${f.order.number}` },
      }),
    ).toBe(1);
  });
  it("deadline cancellation is idempotent, releases inventory and queues a notice", async () => {
    const f = await placed(),
      future = new Date(f.order.paymentDeadlineAt.getTime() + 1000);
    await cancelUnpaidOrders(future);
    await cancelUnpaidOrders(future);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
    ).toBe("CANCELLED");
    expect(
      (await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } }))
        .reserved,
    ).toBe(0);
    expect(
      await db.orderEvent.count({
        where: { orderId: f.order.id, toStatus: "CANCELLED" },
      }),
    ).toBe(1);
    const jobs = await db.job.findMany({ where: { type: "send-email" } });
    expect(
      jobs.some((j) => {
        try {
          const mail = unseal(
            (j.payload as { encrypted: string }).encrypted,
          ) as { to: string; templateKey: string };
          return (
            mail.to === f.address.email &&
            mail.templateKey === "order.cancelled"
          );
        } catch {
          return false;
        }
      }),
    ).toBe(true);
  });
  it("rejects another customer's token and an admin without receipt-approval permission", async () => {
    const f = await placed();
    context.cookies.set("hoda.cart", opaqueToken());
    await expect(authorizedOrder(f.order.number)).rejects.toThrow("NOT_FOUND");
    const user = await db.user.create({
      data: {
        email: `no-pay-${randomUUID()}@example.com`,
        name: "No payment grant",
        passwordHash: "unused",
      },
    });
    await expect(approvePayment(f.order.id, user.id)).rejects.toThrow();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
    ).toBe("PENDING_PAYMENT");
  });
  it("rejects spoofed and oversized receipt files before storage", async () => {
    const f = await placed();
    await expect(
      submitReceipt(
        f.order.number,
        new File(["<script>alert(1)</script>"], "proof.jpg", {
          type: "image/jpeg",
        }),
        "",
        "",
      ),
    ).rejects.toThrow("RECEIPT_INVALID");
    await expect(
      submitReceipt(
        f.order.number,
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "proof.pdf"),
        "",
        "",
      ),
    ).rejects.toThrow("RECEIPT_INVALID");
  });
});

describe.skipIf(!hasDb)("customer OTP abuse and replay protection", () => {
  async function challenge() {
    const email = `otp-${randomUUID()}@example.com`,
      result = await requestCustomerOtp(email, "en", randomUUID());
    const otp = await db.authOtp.findUniqueOrThrow({
      where: { id: result.challengeId },
    });
    const jobs = await db.job.findMany({
      where: { type: "send-email" },
      orderBy: { createdAt: "desc" },
    });
    const mail = jobs
      .map((j) => {
        try {
          return unseal((j.payload as { encrypted: string }).encrypted) as {
            to: string;
            text: string;
          };
        } catch {
          return null;
        }
      })
      .find((m) => m?.to === email)!;
    const token = new URL(mail.text.match(/http:\/\/\S+/)![0]).hash;
    return {
      email,
      otp,
      token: new URLSearchParams(token.slice(1)).get("token")!,
    };
  }
  it("accepts a magic link once and does not create an admin user", async () => {
    const f = await challenge();
    expect(f.otp.linkHash).not.toBe(f.token);
    expect(
      await verifyCustomerOtp({ challengeId: f.otp.id, token: f.token }),
    ).toMatchObject({ email: f.email, isGuest: false });
    expect(
      await verifyCustomerOtp({ challengeId: f.otp.id, token: f.token }),
    ).toBeNull();
    expect(await db.user.count({ where: { email: f.email } })).toBe(0);
  });
  it("locks a challenge after five wrong attempts, even with the correct magic link", async () => {
    const f = await challenge();
    for (let i = 0; i < 5; i++)
      expect(
        await verifyCustomerOtp({ challengeId: f.otp.id, code: "invalid" }),
      ).toBeNull();
    expect(
      await verifyCustomerOtp({ challengeId: f.otp.id, token: f.token }),
    ).toBeNull();
  });
  it("expires a challenge after ten minutes and throttles repeated requests", async () => {
    const f = await challenge();
    await db.authOtp.update({
      where: { id: f.otp.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      await verifyCustomerOtp({ challengeId: f.otp.id, token: f.token }),
    ).toBeNull();
    for (let i = 0; i < 4; i++)
      expect((await requestCustomerOtp(f.email, "en", "test-ip")).ok).toBe(
        true,
      );
    expect((await requestCustomerOtp(f.email, "en", "test-ip")).ok).toBe(false);
  });
});

describe.skipIf(!hasDb)(
  "phase05 credit through real checkout and payment services",
  () => {
    it.each(["partial", "full"])(
      "%s store-credit payment preserves order total and invoice payment history",
      async (mode) => {
        const f = await fixture();
        const customer = await db.customer.create({
          data: { email: f.address.email },
        });
        context.customerId = customer.id;
        const quoted = await quoteCart({
          marketId: f.market.id,
          locale: "tr",
          items: [{ variantId: f.variant.id, quantity: 1 }],
          address: f.address,
        });
        const total = new Decimal(quoted.total),
          amount = mode === "full" ? total : total.div(2).toDecimalPlaces(4);
        const credit = await db.storeCredit.create({
          data: {
            customerId: customer.id,
            currency: "TRY",
            amount: amount.toFixed(),
            balance: amount.toFixed(),
          },
        });
        const placed = await placeOrder(f.address, true, 0, quoted.total, true);
        let order = await db.order.findUniqueOrThrow({
          where: { number: placed.number },
          include: { payments: true, creditUses: true },
        });
        expect(order.totalAmount.toString()).toBe(total.toFixed());
        expect(order.discountAmount.toString()).toBe("0");
        if (mode === "partial") {
          expect(order.status).toBe("PENDING_PAYMENT");
          expect(order.payments[0].amount.toString()).toBe(
            total.sub(amount).toFixed(),
          );
          await submitReceipt(order.number, receipt(), "", "credit-test");
          await rejectPayment(order.id, "Try again", f.user.id);
          await submitReceipt(order.number, receipt(), "", "credit-test");
          expect(await approvePayment(order.id, f.user.id)).toBe("PAID");
          order = await db.order.findUniqueOrThrow({
            where: { id: order.id },
            include: { payments: true, creditUses: true },
          });
        }
        expect(order.status).toBe("PAID");
        const approved = order.payments.filter((p) => p.status === "APPROVED");
        expect(
          approved
            .reduce((n, p) => n.add(p.amount.toString()), new Decimal(0))
            .toFixed(),
        ).toBe(total.toFixed());
        expect(order.creditUses[0].status).toBe("CONSUMED");
        expect(
          (
            await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })
          ).balance.toString(),
        ).toBe("0");
        expect(await db.invoice.count({ where: { orderId: order.id } })).toBe(
          1,
        );
        expect(
          await db.stockMovement.count({
            where: { referenceId: order.id, type: "OUT" },
          }),
        ).toBe(1);
      },
    );
  },
);
