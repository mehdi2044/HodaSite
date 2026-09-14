import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { financeActor } from "./operations";
import { reportFilter } from "./reports";
import { profitTotals, type ProfitRow } from "./profit";
export async function financeDashboard(raw: unknown) {
  const filter = reportFilter(raw);
  return db.$transaction(
    async (tx) => {
      await financeActor(
        tx,
        "finance.report.view",
        filter.marketId || undefined,
      );
      const scope = filter.marketId
        ? Prisma.sql`AND j."marketId"=${filter.marketId}`
        : Prisma.empty;
      const rows = await tx.$queryRaw<ProfitRow[]>(
        Prisma.sql`SELECT j."marketId", a.code,a.kind,sum(l."debitTry"-l."creditTry")::text AS "amountTry",sum(l."debitUsd"-l."creditUsd")::text AS "amountUsd" FROM "JournalEntry" j JOIN "JournalLine" l ON l."entryId"=j.id JOIN "LedgerAccount" a ON a.id=l."accountId" WHERE j.status='POSTED' AND j."effectiveAt">=${filter.start} AND j."effectiveAt"<${filter.end} ${scope} GROUP BY j."marketId",a.code,a.kind ORDER BY j."marketId",a.code`,
      );
      return { filter, rows, totals: profitTotals(rows) };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function financeWorkspace(marketId: string) {
  return db.$transaction(async (tx) => {
    await financeActor(tx, "finance.report.view", marketId);
    const [
      config,
      suppliers,
      purchases,
      expenses,
      partners,
      capital,
      variants,
      warehouses,
    ] = await Promise.all([
      tx.financeConfig.findUnique({ where: { id: marketId } }),
      tx.supplier.findMany({
        where: { marketId, isActive: true },
        orderBy: { name: "asc" },
      }),
      tx.purchaseOrder.findMany({
        where: { marketId },
        include: { supplier: true, items: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.expense.findMany({
        where: { marketId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.partner.findMany({
        where: { marketId, isActive: true },
        orderBy: { name: "asc" },
      }),
      tx.capitalTransaction.findMany({
        where: { marketId },
        include: { partner: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.variant.findMany({
        where: {
          isActive: true,
          product: {
            deletedAt: null,
            OR: [
              { marketIds: { isEmpty: true } },
              { marketIds: { has: marketId } },
            ],
          },
        },
        select: { id: true, sku: true },
        orderBy: { sku: "asc" },
      }),
      tx.warehouse.findMany({ select: { id: true, nameI18n: true } }),
    ]);
    return {
      config,
      suppliers,
      purchases,
      expenses,
      partners,
      capital,
      variants,
      warehouses,
    };
  });
}
