import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { visibleFinanceMarkets } from "./service";
import { reportFilter } from "./reports";
import { reconcileOrder } from "./reconciliation";

// Financial evidence only: no contact/address/customer data, receipts or bank details.
const select = {
  id: true,
  number: true,
  marketId: true,
  currency: true,
  status: true,
  kind: true,
  paidAt: true,
  subtotalAmount: true,
  feeTotalAmount: true,
  discountAmount: true,
  totalAmount: true,
  totalAmountTry: true,
  totalAmountUsd: true,
  fxSnapshot: true,
  items: { select: { lineTotalAmount: true, currency: true } },
  fees: { select: { amount: true, currency: true, absorbed: true } },
  payments: {
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      status: true,
      reviewedAt: true,
      reference: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  creditUses: {
    select: {
      id: true,
      amount: true,
      status: true,
      credit: { select: { currency: true } },
    },
  },
  _count: {
    select: {
      returns: { where: { status: { not: "REJECTED" } } },
      refunds: { where: { status: { not: "VOIDED" } } },
    },
  },
} satisfies Prisma.OrderSelect;
function present(o: Prisma.OrderGetPayload<{ select: typeof select }>) {
  const payments = o.payments.map((p) => ({
    ...p,
    amount: p.amount.toFixed(4),
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
  }));
  const review = reconcileOrder({
    currency: o.currency,
    status: o.status,
    paidAt: o.paidAt?.toISOString() ?? null,
    subtotal: o.subtotalAmount.toFixed(4),
    fees: o.feeTotalAmount.toFixed(4),
    discount: o.discountAmount.toFixed(4),
    total: o.totalAmount.toFixed(4),
    totalTry: o.totalAmountTry.toFixed(4),
    totalUsd: o.totalAmountUsd.toFixed(4),
    fxSnapshot: o.fxSnapshot,
    items: o.items.map((i) => ({
      amount: i.lineTotalAmount.toFixed(4),
      currency: i.currency,
    })),
    feeLines: o.fees.map((f) => ({ ...f, amount: f.amount.toFixed(4) })),
    payments,
    creditUses: o.creditUses.map((c) => ({
      id: c.id,
      amount: c.amount.toFixed(4),
      currency: c.credit.currency,
      status: c.status,
    })),
    returnActivity: o._count.returns > 0 || o._count.refunds > 0,
  });
  return {
    id: o.id,
    number: o.number,
    marketId: o.marketId,
    currency: o.currency,
    kind: o.kind,
    paidAt: o.paidAt,
    total: o.totalAmount.toFixed(4),
    totalTry: o.totalAmountTry.toFixed(4),
    totalUsd: o.totalAmountUsd.toFixed(4),
    discount: o.discountAmount.toFixed(4),
    review,
    // Reference may contain a bank transfer identifier: it is used for checking,
    // never returned to the report surface.
    payments: payments.map(
      ({ id, amount, currency, method, status, reviewedAt }) => ({
        id,
        amount,
        currency,
        method,
        status,
        reviewedAt,
      }),
    ),
  };
}
async function marketsForActor() {
  const userId = (await auth())?.user?.id;
  if (!userId) throw new UnauthorizedError();
  const markets = await visibleFinanceMarkets(userId);
  if (!markets.length) throw new ForbiddenError("finance.report.view");
  return markets;
}
export async function reconciliationList(raw: unknown) {
  const markets = await marketsForActor();
  const query = z
    .object({
      from: z.unknown().optional(),
      to: z.unknown().optional(),
      marketId: z.unknown().optional(),
      cursor: z.string().min(1).max(100).optional(),
    })
    .strict()
    .parse(raw);
  const filter = reportFilter({
    from: query.from,
    to: query.to,
    marketId: query.marketId,
  });
  if (filter.marketId && !markets.some((m) => m.id === filter.marketId))
    throw new ForbiddenError("finance.report.view");
  const where = {
    marketId: {
      in: filter.marketId ? [filter.marketId] : markets.map((m) => m.id),
    },
    paidAt: { gte: filter.start, lt: filter.end },
  };
  const result = await db.$transaction(
    async (tx) => {
      const cursor = query.cursor
        ? await tx.order.findFirst({
            where: { ...where, id: query.cursor },
            select: { id: true, paidAt: true },
          })
        : null;
      if (query.cursor && !cursor?.paidAt)
        throw new Error("INVALID_RECONCILIATION_CURSOR");
      const orders = await tx.order.findMany({
        where: {
          ...where,
          ...(cursor?.paidAt
            ? {
                OR: [
                  { paidAt: { lt: cursor.paidAt } },
                  { paidAt: cursor.paidAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        take: 31,
        select,
      });
      return {
        rows: orders.slice(0, 30).map(present),
        next: orders.length > 30 ? orders[29].id : null,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
  return { markets, filter, ...result };
}
export async function reconciliationDetail(id: string) {
  const markets = await marketsForActor();
  if (typeof id !== "string" || !id || id.length > 100)
    throw new ForbiddenError("finance.report.view");
  const order = await db.$transaction(
    (tx) =>
      tx.order.findFirst({
        where: { id, marketId: { in: markets.map((m) => m.id) } },
        select,
      }),
    { isolationLevel: "RepeatableRead" },
  );
  if (!order) throw new ForbiddenError("finance.report.view");
  return {
    ...present(order),
    marketCode: markets.find((m) => m.id === order.marketId)!.code,
  };
}
