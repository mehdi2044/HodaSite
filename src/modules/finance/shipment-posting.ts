import { Prisma } from "@prisma/client";
import { snapshot, Exact } from "./operations-input";
import { postPair } from "./posting";
import { reverseDomainEntry } from "./persistence";

/** Resolve only accepted database quotes/overrides inside the caller's transaction. */
async function ratesAt(
  tx: Prisma.TransactionClient,
  currency: string,
  at: Date,
  marketId: string,
) {
  const quote = async (currency: string) => {
    if (currency === "USD") return { rate: "1", at };
    const market =
      (await tx.market.findFirst({
        where: { currency, id: marketId },
        select: { id: true },
      })) ??
      (await tx.market.findFirst({
        where: { currency },
        orderBy: { id: "asc" },
        select: { id: true },
      }));
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
  if (previous?.requestKey === `${prefix}${input.version}`) {
    const line = previous.lines.find((l) => l.debit.gt(0));
    if (
      !line ||
      line.currency !== input.currency ||
      !line.debit.equals(input.amount)
    )
      throw new Error("JOURNAL_REQUEST_CONFLICT");
    return;
  }
  if (previous)
    await reverseDomainEntry(
      tx,
      previous.id,
      `shipment-reverse:${input.legId}:${input.version}`,
      `shipment:${input.legId}`,
      input.at,
      input.actor,
    );
  const estimates = await tx.orderFee.findMany({
    where: { orderId: input.orderId, type: "SHIPPING", absorbed: true },
    select: { id: true },
  });
  for (const fee of estimates) {
    const entry = await tx.journalEntry.findUnique({
      where: {
        marketId_requestKey: {
          marketId: input.marketId,
          requestKey: `absorbed-fee:${fee.id}`,
        },
      },
    });
    if (entry)
      await reverseDomainEntry(
        tx,
        entry.id,
        `shipping-estimate:${fee.id}`,
        `shipment:${input.legId}`,
        input.at,
        input.actor,
      );
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
    rates: await ratesAt(tx, input.currency, input.at, input.marketId),
    actor: input.actor,
  });
}
