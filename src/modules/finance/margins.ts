import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { financeActor } from "./operations";
import { reportFilter } from "./reports";
import { Exact } from "./operations-input";
export const marginDimensions = [
  "order",
  "product",
  "variant",
  "category",
  "brand",
  "market",
  "day",
] as const;
export async function marginReport(
  raw: unknown,
  dimensionRaw: unknown = "order",
) {
  const filter = reportFilter(raw),
    dimension = z.enum(marginDimensions).parse(dimensionRaw);
  return db.$transaction(
    async (tx) => {
      await financeActor(tx, "finance.report.view", filter.marketId);
      const columns = {
        order: Prisma.sql`f."orderId"`,
        product: Prisma.sql`f."productId"`,
        variant: Prisma.sql`f."variantId"`,
        category: Prisma.sql`f."categoryId"`,
        brand: Prisma.sql`coalesce(f."brandId",'')`,
        market: Prisma.sql`f."marketId"`,
        day: Prisma.sql`to_char(j."effectiveAt" AT TIME ZONE 'UTC','YYYY-MM-DD')`,
      };
      const scope = filter.marketId
        ? Prisma.sql`AND f."marketId"=${filter.marketId}`
        : Prisma.empty;
      const rows = await tx.$queryRaw<
        {
          key: string;
          revenueTry: string;
          revenueUsd: string;
          costTry: string;
          costUsd: string;
          expenseTry: string;
          expenseUsd: string;
          absorbedTry: string;
          absorbedUsd: string;
        }[]
      >(Prisma.sql`
      SELECT ${columns[dimension]} AS key,
      sum(f."revenueTry")::text AS "revenueTry",sum(f."revenueUsd")::text AS "revenueUsd",
      sum(f."costTry")::text AS "costTry",sum(f."costUsd")::text AS "costUsd",
      sum(f."expenseTry")::text AS "expenseTry",sum(f."expenseUsd")::text AS "expenseUsd",
      sum(CASE WHEN source."requestKey" LIKE 'absorbed-fee:%' THEN f."expenseTry" ELSE 0 END)::text AS "absorbedTry",
      sum(CASE WHEN source."requestKey" LIKE 'absorbed-fee:%' THEN f."expenseUsd" ELSE 0 END)::text AS "absorbedUsd"
      FROM "FinanceAttribution" f JOIN "JournalEntry" j ON j.id=f."entryId" JOIN "JournalEntry" source ON source.id=coalesce(j."reversalOfId",j.id)
      WHERE j."effectiveAt">=${filter.start} AND j."effectiveAt"<${filter.end} ${scope}
      GROUP BY ${columns[dimension]} ORDER BY ${columns[dimension]}`);
      const calculated = rows.map((r) => ({
        ...r,
        grossTry: new Exact(r.revenueTry).sub(r.costTry).toFixed(4),
        grossUsd: new Exact(r.revenueUsd).sub(r.costUsd).toFixed(4),
        contributionTry: new Exact(r.revenueTry)
          .sub(r.costTry)
          .sub(r.expenseTry)
          .toFixed(4),
        contributionUsd: new Exact(r.revenueUsd)
          .sub(r.costUsd)
          .sub(r.expenseUsd)
          .toFixed(4),
        marginPercent: new Exact(r.revenueTry).gt(0)
          ? new Exact(r.revenueTry)
              .sub(r.costTry)
              .div(r.revenueTry)
              .mul(100)
              .toFixed(2)
          : null,
      }));
      return { filter, dimension, rows: calculated };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function partnerStatement(raw: unknown, partnerId: string) {
  const filter = reportFilter(raw);
  return db.$transaction(
    async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: z.string().min(1).max(100).parse(partnerId) },
      });
      await financeActor(
        tx,
        "finance.report.view",
        partner?.marketId ?? filter.marketId,
      );
      if (!partner || (filter.marketId && partner.marketId !== filter.marketId))
        throw new Error("NOT_FOUND");
      const originals = await tx.capitalTransaction.findMany({
        where: { partnerId, effectiveAt: { lt: filter.end } },
        orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
      });
      const reversals = await tx.journalEntry.findMany({
        where: {
          reversalOfId: { in: originals.map((r) => r.journalId) },
          effectiveAt: { lt: filter.end },
        },
        select: { id: true, reversalOfId: true, effectiveAt: true },
      });
      const rows = originals.map((r) => ({ ...r, reversal: false }));
      for (const reversal of reversals) {
        const original = originals.find(
          (r) => r.journalId === reversal.reversalOfId,
        )!;
        rows.push({
          ...original,
          id: reversal.id,
          journalId: reversal.id,
          effectiveAt: reversal.effectiveAt,
          amount: original.amount.negated(),
          reversal: true,
        });
      }
      rows.sort(
        (a, b) =>
          a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
          a.id.localeCompare(b.id),
      );
      const opening = { TRY: new Exact(0), USD: new Exact(0) },
        movement = { TRY: new Exact(0), USD: new Exact(0) };
      for (const r of rows) {
        const group = r.effectiveAt < filter.start ? opening : movement;
        const sign = r.kind === "CONTRIBUTION" ? 1 : -1;
        group.TRY = group.TRY.add(
          new Exact(r.amount.toString())
            .mul(r.rateTry.toString())
            .toDecimalPlaces(4)
            .mul(sign),
        );
        group.USD = group.USD.add(
          new Exact(r.amount.toString())
            .mul(r.rateUsd.toString())
            .toDecimalPlaces(4)
            .mul(sign),
        );
      }
      return {
        partner,
        filter,
        rows: rows.filter((r) => r.effectiveAt >= filter.start),
        totals: ["TRY", "USD"].map((currency) => {
          const c = currency as "TRY" | "USD";
          return {
            currency,
            opening: opening[c].toFixed(4),
            movement: movement[c].toFixed(4),
            closing: opening[c].add(movement[c]).toFixed(4),
          };
        }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
