import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
/** Customer identity is established by checkout; callers hold the order lock. */
export async function reserveCredit(
  tx: Prisma.TransactionClient,
  customerId: string,
  orderId: string,
  currency: string,
  total: string,
  onlyCreditId?: string,
) {
  await tx.$queryRaw`SELECT id FROM "StoreCredit" WHERE "customerId"=${customerId} AND currency=${currency} ORDER BY id FOR UPDATE`;
  const credits = await tx.storeCredit.findMany({
    where: {
      customerId,
      currency,
      balance: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(onlyCreditId ? { id: onlyCreditId } : {}),
    },
    orderBy: { id: "asc" },
  });
  let due = new Decimal(total);
  for (const credit of credits) {
    const amount = Decimal.min(due, credit.balance.toString());
    if (amount.lte(0)) break;
    await tx.storeCredit.update({
      where: { id: credit.id },
      data: { balance: { decrement: amount.toFixed() } },
    });
    const use = await tx.creditUse.create({
      data: { orderId, creditId: credit.id, amount: amount.toFixed() },
    });
    await tx.auditLog.create({
      data: {
        action: "credit.reserved",
        entityType: "CreditUse",
        entityId: use.id,
        after: {
          customerId,
          orderId,
          creditId: credit.id,
          amount: amount.toFixed(),
          currency,
        },
      },
    });
    due = due.sub(amount);
  }
  return { due: due.toFixed(), amount: new Decimal(total).sub(due).toFixed() };
}
export async function consumeCredit(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId?: string,
) {
  const rows = await tx.creditUse.findMany({
    where: { orderId, status: "RESERVED" },
    include: { credit: true },
    orderBy: { creditId: "asc" },
  });
  for (const row of rows) {
    await tx.payment.create({
      data: {
        orderId,
        amount: row.amount,
        currency: row.credit.currency,
        method: "STORE_CREDIT",
        status: "APPROVED",
        reference: row.id,
        reviewedAt: new Date(),
        reviewedBy: userId,
      },
    });
    await tx.creditUse.update({
      where: { id: row.id },
      data: { status: "CONSUMED" },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: "credit.consumed",
        entityType: "CreditUse",
        entityId: row.id,
        after: { orderId, amount: row.amount.toString() },
      },
    });
  }
}
export async function releaseCredit(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const rows = await tx.creditUse.findMany({
    where: { orderId, status: "RESERVED" },
    orderBy: { creditId: "asc" },
  });
  for (const row of rows) {
    await tx.storeCredit.update({
      where: { id: row.creditId },
      data: { balance: { increment: row.amount } },
    });
    await tx.creditUse.update({
      where: { id: row.id },
      data: { status: "RELEASED" },
    });
    await tx.auditLog.create({
      data: {
        action: "credit.released",
        entityType: "CreditUse",
        entityId: row.id,
        after: { orderId, amount: row.amount.toString() },
      },
    });
  }
}
