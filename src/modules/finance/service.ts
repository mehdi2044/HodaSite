import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { can, ForbiddenError, UnauthorizedError } from "@/modules/access";
import { reportFilter, summarizeReports, type ReportEvent } from "./reports";
export async function visibleFinanceMarkets(userId: string) {
  // Include inactive markets: retained historical transactions remain reportable.
  const markets = await db.market.findMany({
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const allowed = await Promise.all(
    markets.map((m) => can(userId, "finance.report.view", { marketId: m.id })),
  );
  return markets.filter((_, i) => allowed[i]);
}
export async function financeReport(raw: unknown) {
  const user = (await auth())?.user?.id;
  if (!user) throw new UnauthorizedError();
  const markets = await visibleFinanceMarkets(user);
  if (!markets.length) throw new ForbiddenError("finance.report.view");
  const filter = reportFilter(raw);
  if (filter.marketId && !markets.some((m) => m.id === filter.marketId))
    throw new ForbiddenError("finance.report.view");
  const ids = filter.marketId ? [filter.marketId] : markets.map((m) => m.id);
  // A single SQL statement gives one MVCC snapshot, avoids joined-row duplication,
  // and aggregates in PostgreSQL without limiting or loading individual customers.
  const rows = await db.$queryRaw<ReportEvent[]>(Prisma.sql`
    WITH events AS (
      SELECT o."marketId", o.currency, 'paidOrders'::text AS kind, o."paidAt" AS at, o."totalAmount" AS amount
      FROM "Order" o WHERE o."marketId" IN (${Prisma.join(ids)}) AND o."paidAt" >= ${filter.start} AND o."paidAt" < ${filter.end}
      UNION ALL
      SELECT o."marketId", p.currency, CASE WHEN p.method='STORE_CREDIT' THEN 'creditPayments' ELSE 'externalPayments' END, p."reviewedAt", p.amount
      FROM "Payment" p JOIN "Order" o ON o.id=p."orderId"
      WHERE o."marketId" IN (${Prisma.join(ids)}) AND p.status='APPROVED' AND p."reviewedAt" >= ${filter.start} AND p."reviewedAt" < ${filter.end}
      UNION ALL
      SELECT o."marketId", r.currency, CASE WHEN r.method='STORE_CREDIT' THEN 'creditRefunds' ELSE 'externalRefunds' END, r."createdAt", r.amount
      FROM "Refund" r JOIN "Order" o ON o.id=r."orderId"
      WHERE o."marketId" IN (${Prisma.join(ids)}) AND r.status='COMPLETED' AND r."createdAt" >= ${filter.start} AND r."createdAt" < ${filter.end}
      UNION ALL
      SELECT o."marketId", p.currency, 'undated', NULL::timestamptz, 0::numeric
      FROM "Payment" p JOIN "Order" o ON o.id=p."orderId"
      WHERE o."marketId" IN (${Prisma.join(ids)}) AND p.status='APPROVED' AND p."reviewedAt" IS NULL
    )
    SELECT "marketId", currency, kind, to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      sum(amount)::text AS amount, count(*)::text AS count
    FROM events GROUP BY "marketId", currency, kind, day
    ORDER BY "marketId", currency, day, kind
  `);
  return { filter, markets, rows: summarizeReports(rows) };
}
