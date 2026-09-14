import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { financeActor } from "./operations";
import { reportFilter } from "./reports";
export async function operationsMetrics(raw: unknown) {
  const filter = reportFilter(raw);
  return db.$transaction(
    async (tx) => {
      await financeActor(tx, "finance.report.view", filter.marketId);
      const scope = filter.marketId
        ? Prisma.sql`AND o."marketId"=${filter.marketId}`
        : Prisma.empty;
      const [payments] = await tx.$queryRaw<
        { count: string; missing: string; minutes: string | null }[]
      >(
        Prisma.sql`SELECT count(*)::text AS count,count(*) FILTER(WHERE p."submittedAt" IS NULL OR p."reviewedAt"<p."submittedAt")::text AS missing,round(avg(extract(epoch FROM(p."reviewedAt"-p."submittedAt"))/60) FILTER(WHERE p."reviewedAt">=p."submittedAt"),2)::text AS minutes FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" WHERE p.status='APPROVED' AND p."reviewedAt">=${filter.start} AND p."reviewedAt"<${filter.end} ${scope}`,
      );
      const [fulfillment] = await tx.$queryRaw<
        { count: string; missing: string; minutes: string | null }[]
      >(
        Prisma.sql`SELECT count(*)::text AS count,count(*) FILTER(WHERE o."paidAt" IS NULL OR o."deliveredAt"<o."paidAt")::text AS missing,round(avg(extract(epoch FROM(o."deliveredAt"-o."paidAt"))/60) FILTER(WHERE o."deliveredAt">=o."paidAt"),2)::text AS minutes FROM "Order" o WHERE o."deliveredAt">=${filter.start} AND o."deliveredAt"<${filter.end} ${scope}`,
      );
      const returns = await tx.$queryRaw<
        { status: string; currency: string; count: string; amount: string }[]
      >(
        Prisma.sql`SELECT r.status::text AS status,o.currency,count(*)::text AS count,sum(r."refundAmount")::text AS amount FROM "ReturnRequest" r JOIN "Order" o ON o.id=r."orderId" WHERE r."createdAt">=${filter.start} AND r."createdAt"<${filter.end} ${scope} GROUP BY r.status,o.currency ORDER BY r.status,o.currency`,
      );
      return { filter, payments, fulfillment, returns };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
