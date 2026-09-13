import { type PrismaClient } from "@prisma/client";
import { returnFixture } from "./returns";

/** Only synthetic isolated orders; setup is complete before any review executes. */
export async function reconciliationFixture(
  db: PrismaClient,
  { code = "TR", day = "2006-01-15", mismatch = false } = {},
) {
  const marketPerUsd = code === "TR" ? "40" : "500000";
  const at = new Date(`${day}T12:00:00Z`);
  const f = await returnFixture(db, {
    code,
    pending: true,
    quantity: 1,
    price: "100.0001",
    fxSnapshot: {
      marketPerUsd,
      tryPerUsd: "40",
      quotedAt: at.toISOString(),
      terms: "private-quote-terms",
    },
  });
  await db.order.update({
    where: { id: f.order.id },
    data: {
      status: "PAID",
      paidAt: at,
    },
  });
  await db.payment.create({
    data: {
      orderId: f.order.id,
      currency: f.market.currency,
      amount: mismatch ? "60" : "60.0001",
      method: "CASH",
      status: "APPROVED",
      reviewedAt: at,
      reference: "private-bank-reference",
    },
  });
  const credit = await db.storeCredit.create({
    data: {
      customerId: f.customer.id,
      amount: "40",
      balance: "0",
      currency: f.market.currency,
    },
  });
  const use = await db.creditUse.create({
    data: {
      orderId: f.order.id,
      creditId: credit.id,
      amount: "40",
      status: "CONSUMED",
    },
  });
  await db.payment.create({
    data: {
      orderId: f.order.id,
      currency: f.market.currency,
      amount: "40",
      method: "STORE_CREDIT",
      status: "APPROVED",
      reviewedAt: at,
      reference: use.id,
    },
  });
  return f;
}
