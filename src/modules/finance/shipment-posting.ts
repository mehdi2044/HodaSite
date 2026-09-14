import { Prisma } from "@prisma/client";
import { snapshot, Exact } from "./operations-input";
import { postPair } from "./posting";
import { insert, lockRequest, replay } from "./persistence";
import { normalizeJournal, journalHash } from "./journal-input";

/** Resolve only accepted database quotes/overrides inside the caller's transaction. */
async function ratesAt(
  tx: Prisma.TransactionClient,
  currency: string,
  at: Date,
) {
  const quote = async (currency: string) => {
    if (currency === "USD") return { rate: "1", at };
    const market = await tx.market.findFirst({
      where: { currency },
      select: { id: true },
    });
    if (!market) throw new Error("FINANCE_FX_MISSING");
    const override = await tx.fxOverride.findFirst({
      where: {
        marketId: market.id,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (override)
      return { rate: override.rate.toString(), at: override.validFrom };
    const row = await tx.fxQuote.findFirst({
      where: {
        marketId: market.id,
        status: { in: ["ACTIVE", "SUPERSEDED"] },
        acceptedAt: { lte: at },
      },
      orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    });
    if (!row) throw new Error("FINANCE_FX_MISSING");
    return { rate: row.rate.toString(), at: row.acceptedAt! };
  };
  const original = await quote(currency),
    tr = currency === "TRY" ? original : await quote("TRY");
  return snapshot.parse({
    currency,
    rateTry: new Exact(tr.rate).div(original.rate).toFixed(12),
    rateUsd: new Exact(1).div(original.rate).toFixed(12),
    fxAsOf: new Date(
      Math.min(original.at.getTime(), tr.at.getTime()),
    ).toISOString(),
    effectiveAt: at.toISOString(),
  });
}
export async function recognizeShipmentCost(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    marketId: string;
    legId: string;
    version: number;
    amount: string;
    currency: string;
    actor: string;
    at: Date;
  },
) {
  const config = await tx.financeConfig.findUnique({
    where: { id: input.marketId },
  });
  if (!config?.enabled || !config.enabledAt || input.at < config.enabledAt)
    return;
  const prefix = `shipment-cost:${input.legId}:`;
  const previous = await tx.journalEntry.findFirst({
    where: { marketId: input.marketId, requestKey: { startsWith: prefix } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { lines: true },
  });
  if (
    previous &&
    !(await tx.journalEntry.findUnique({
      where: { reversalOfId: previous.id },
    }))
  ) {
    await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE id=${previous.id} FOR UPDATE`;
    const requestKey = `shipment-reverse:${input.legId}:${input.version}`;
    const raw = {
      marketId: input.marketId,
      requestKey,
      memo: `shipment:${input.legId}`,
      effectiveAt: input.at.toISOString(),
      fxAsOf: previous.fxAsOf.toISOString(),
      lines: previous.lines.map((l) => ({
        accountId: l.accountId,
        currency: l.currency,
        debit: l.credit.toFixed(4),
        credit: l.debit.toFixed(4),
        rateTry: l.rateTry.toFixed(12),
        rateUsd: l.rateUsd.toFixed(12),
      })),
    };
    const normalized = normalizeJournal(raw),
      hash = journalHash({ kind: "DOMAIN_SHIPMENT_REVERSAL", ...normalized });
    await lockRequest(tx, input.marketId, requestKey);
    if (!(await replay(tx, input.marketId, requestKey, hash))) {
      const reversed = await insert(
        tx,
        normalized,
        input.actor,
        hash,
        previous.id,
      );
      for (const a of await tx.financeAttribution.findMany({
        where: { entryId: previous.id },
      })) {
        const { id, ...values } = a;
        void id;
        await tx.financeAttribution.create({
          data: {
            ...values,
            entryId: reversed.id,
            revenueTry: a.revenueTry.negated(),
            revenueUsd: a.revenueUsd.negated(),
            costTry: a.costTry.negated(),
            costUsd: a.costUsd.negated(),
            expenseTry: a.expenseTry.negated(),
            expenseUsd: a.expenseUsd.negated(),
          },
        });
      }
    }
  }
  if (new Exact(input.amount).isZero()) return;
  await postPair(tx, {
    marketId: input.marketId,
    key: `${prefix}${input.version}`,
    memo: `shipment:${input.legId}`,
    orderId: input.orderId,
    amount: input.amount,
    debit: "shipping_expense",
    credit: "payables",
    rates: await ratesAt(tx, input.currency, input.at),
    actor: input.actor,
  });
}
