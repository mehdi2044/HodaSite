import { randomUUID, createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
/** Paid-order fixture isolates shipping; checkout/payment have their own end-to-end tests. */
export async function shippingFixture(
  db: PrismaClient,
  code = "IR",
  quantity = 2,
  locale = "en",
) {
  const suffix = randomUUID();
  const market = await db.market.findUniqueOrThrow({ where: { code } });
  const variant = await db.variant.findFirstOrThrow();
  const email = `shipping-${suffix}@example.com`;
  const guestToken = randomUUID();
  const customer = await db.customer.create({ data: { email } });
  const cart = await db.cart.create({
    data: {
      tokenHash: createHash("sha256").update(suffix).digest("hex"),
      marketId: market.id,
      locale,
      currency: market.currency,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const total = new Prisma.Decimal("10").mul(quantity);
  const order = await db.order.create({
    data: {
      number: `${code}-SHIP-${suffix.slice(0, 8)}`,
      marketId: market.id,
      customerId: customer.id,
      cartId: cart.id,
      guestTokenHash: createHash("sha256").update(guestToken).digest("hex"),
      status: "PAID",
      paidAt: new Date(Date.now() - 1800000),
      placedAt: new Date(Date.now() - 3600000),
      locale,
      currency: market.currency,
      subtotalAmount: total,
      feeTotalAmount: "0",
      totalAmount: total,
      totalAmountTry: total,
      totalAmountUsd: total,
      fxSnapshot: {},
      bankSnapshot: [],
      contactSnapshot: { email, firstName: "Shipping test" },
      holdExpiresAt: new Date(Date.now() + 86400000),
      paymentDeadlineAt: new Date(Date.now() + 86400000),
      shippingAddress: { line1: "Private test address" },
      billingAddress: {},
      adminNote: "Private operations note",
      items: {
        create: {
          variantId: variant.id,
          productSnapshot: {
            sku: variant.sku,
            title: { fa: "آزمایش", tr: "Test", en: "Test" },
          },
          unitPriceAmount: "10",
          currency: market.currency,
          quantity,
          lineTotalAmount: total,
          weightGrams: 100,
        },
      },
    },
    include: { items: true },
  });
  return { order, market, email, guestToken };
}
export async function shippingActor(
  db: PrismaClient,
  roleKey = "owner",
  marketId?: string,
) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  return db.user.create({
    data: {
      email: `shipping-actor-${randomUUID()}@example.com`,
      name: "Shipping test",
      passwordHash: "unused",
      roles: {
        create: {
          roleId: role.id,
          ...(marketId ? { scope: { marketId } } : {}),
        },
      },
    },
  });
}
export const legValues = (
  status: "PENDING" | "IN_TRANSIT" | "DELIVERED" | "FAILED" = "IN_TRANSIT",
) => ({
  status,
  carrierName: "Test carrier",
  service: "Test service",
  trackingNumber: "SHIP / 123",
  trackingUrlTemplate: "https://example.com/track/{tracking}",
  costAmount: "12.3456",
  costCurrency: "TRY",
  shippedAt: null,
  deliveredAt: null,
  eta: null,
});
export const labels = {
  fa: "ارسال آزمایشی",
  tr: "Test teslimat",
  en: "Test shipping",
};
export const workflowValues = (marketId: string) => ({
  marketId,
  nameI18n: labels,
  isDefault: false,
  isActive: true,
  legs: [
    {
      type: "DOMESTIC",
      labelI18n: labels,
      carrierName: "Test carrier",
      trackingUrlTemplate: "",
    },
  ],
});
export function shippingForm(values: Record<string, string>) {
  const f = new FormData();
  for (const [key, value] of Object.entries(values)) f.set(key, value);
  return f;
}
