import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Exact, snapshot, equivalents } from "./operations-input";
import { postDomainJournal } from "./persistence";
type Tx = Prisma.TransactionClient;
export type Rates = z.infer<typeof snapshot>;

/** Each economic component is a balanced pair, including TRY/USD rounding. */
export async function postPair(
  tx: Tx,
  input: {
    marketId: string;
    key: string;
    memo: string;
    amount: string;
    debit: string;
    credit: string;
    rates: Rates;
    actor: string | null;
  },
) {
  const { rates } = input;
  snapshot.parse(rates);
  if (new Exact(input.amount).isZero()) return null;
  equivalents(input.amount, rates);
  const accounts = await tx.ledgerAccount.findMany({
    where: {
      marketId: input.marketId,
      currency: rates.currency,
      code: { in: [input.debit, input.credit] },
      isActive: true,
    },
  });
  const account = (code: string) => {
    const row = accounts.find((a) => a.code === code);
    if (!row) throw new Error("INVALID_LEDGER_ACCOUNT");
    return row.id;
  };
  return postDomainJournal(
    tx,
    {
      marketId: input.marketId,
      requestKey: input.key,
      memo: input.memo,
      effectiveAt: rates.effectiveAt,
      fxAsOf: rates.fxAsOf,
      lines: [
        {
          accountId: account(input.debit),
          currency: rates.currency,
          debit: input.amount,
          credit: "0",
          rateTry: rates.rateTry,
          rateUsd: rates.rateUsd,
        },
        {
          accountId: account(input.credit),
          currency: rates.currency,
          debit: "0",
          credit: input.amount,
          rateTry: rates.rateTry,
          rateUsd: rates.rateUsd,
        },
      ],
    },
    input.actor,
  );
}
const quote = z.object({
  marketPerUsd: z.string().refine((v) => new Exact(v).gt(0)),
  tryPerUsd: z.string().refine((v) => new Exact(v).gt(0)),
  quotedAt: z.iso.datetime(),
});
export function orderRates(currency: string, raw: unknown, at: Date): Rates {
  const q = quote.parse(raw);
  return snapshot.parse({
    currency,
    rateTry: new Exact(q.tryPerUsd).div(q.marketPerUsd).toFixed(12),
    rateUsd: new Exact(1).div(q.marketPerUsd).toFixed(12),
    fxAsOf: q.quotedAt,
    effectiveAt: at.toISOString(),
  });
}

/** Called only inside the authorized order transition transaction; never backfills. */
export async function recognizePaidOrder(
  tx: Tx,
  orderId: string,
  actor: string | null,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, fees: true },
  });
  const config = await tx.financeConfig.findUnique({
    where: { id: order.marketId },
  });
  if (
    !config?.enabled ||
    !config.enabledAt ||
    !order.paidAt ||
    order.paidAt < config.enabledAt
  )
    return;
  const rates = orderRates(order.currency, order.fxSnapshot, order.paidAt);
  const base = { marketId: order.marketId, rates, actor, memo: order.number };
  for (const p of order.payments.filter((p) => p.status === "APPROVED")) {
    if (p.currency !== order.currency) throw new Error("FINANCE_CURRENCY");
    await postPair(tx, {
      ...base,
      key: `payment:${p.id}`,
      amount: p.amount.toFixed(4),
      debit:
        p.method === "STORE_CREDIT"
          ? "store_credit"
          : p.method === "CASH"
            ? "cash"
            : "bank",
      credit: "clearing",
    });
  }
  const paid = order.payments
    .filter((p) => p.status === "APPROVED")
    .reduce((n, p) => n.add(p.amount.toString()), new Exact(0));
  if (!paid.eq(order.totalAmount.toString()))
    throw new Error("FINANCE_SETTLEMENT");
  await postPair(tx, {
    ...base,
    key: `sale:${order.id}`,
    amount: new Exact(order.subtotalAmount.toString())
      .sub(order.discountAmount.toString())
      .toFixed(4),
    debit: "clearing",
    credit: "sales",
  });
  for (const f of order.fees.filter((f) => !f.absorbed))
    await postPair(tx, {
      ...base,
      key: `fee:${f.id}`,
      amount: f.amount.toFixed(4),
      debit: "clearing",
      credit:
        f.type === "TAX"
          ? "tax_collected"
          : f.type === "SHIPPING"
            ? "shipping_income"
            : "fees",
    });
  const movements = await tx.stockMovement.findMany({
    where: { referenceId: orderId, type: "OUT" },
    include: { lot: true },
  });
  for (const m of movements) {
    if (!m.lot) throw new Error("FINANCE_COST_MISSING");
    const l = m.lot;
    const amount = new Exact(l.unitCostAmount.toString()).mul(-m.quantity);
    if (amount.isZero()) continue;
    const lr = {
      currency: l.unitCostCurrency as Rates["currency"],
      rateTry: new Exact(l.unitCostAmountTry.toString())
        .div(l.unitCostAmount.toString())
        .toFixed(12),
      rateUsd: new Exact(l.unitCostAmountUsd.toString())
        .div(l.unitCostAmount.toString())
        .toFixed(12),
      fxAsOf: l.receivedAt.toISOString(),
      effectiveAt: order.paidAt.toISOString(),
    };
    await postPair(tx, {
      ...base,
      rates: lr,
      key: `cogs:${m.id}`,
      amount: amount.toFixed(4),
      debit: "cogs",
      credit: "inventory",
    });
  }
}

/** Historical orders without recognized sales are intentionally excluded. */
export async function recognizeReturn(tx: Tx, returnId: string, actor: string) {
  const row = await tx.returnRequest.findUniqueOrThrow({
    where: { id: returnId },
    include: { order: true, items: true },
  });
  const recognized = await tx.journalEntry.findUnique({
    where: {
      marketId_requestKey: {
        marketId: row.order.marketId,
        requestKey: `sale:${row.orderId}`,
      },
    },
  });
  if (!recognized) return;
  const base = {
    marketId: row.order.marketId,
    rates: orderRates(
      row.order.currency,
      row.order.fxSnapshot,
      row.resolvedAt ?? row.receivedAt ?? new Date(),
    ),
    actor,
    memo: row.order.number,
  };
  if (row.status === "RESOLVED") {
    const refunds = await tx.refund.findMany({
      where: { returnRequestId: returnId, status: "COMPLETED" },
    });
    for (const r of refunds)
      await postPair(tx, {
        ...base,
        key: `refund:${r.id}`,
        amount: r.amount.toFixed(4),
        debit: "sales",
        credit:
          r.method === "STORE_CREDIT"
            ? "store_credit"
            : r.method === "CASH"
              ? "cash"
              : "bank",
      });
    if (row.resolution !== "REFUND") {
      const credits = await tx.storeCredit.findMany({
        where: { sourceReturnId: returnId },
      });
      for (const c of credits)
        await postPair(tx, {
          ...base,
          key: `credit:${c.id}`,
          amount: c.amount.toFixed(4),
          debit: "sales",
          credit: "store_credit",
        });
    }
  }
  if (row.receivedAt) {
    const moves = await tx.stockMovement.findMany({
      where: {
        referenceId: { in: row.items.map((i) => i.id) },
        type: "RETURN_RESTOCK",
      },
      include: { lot: true },
    });
    for (const m of moves) {
      if (!m.lot) throw new Error("FINANCE_COST_MISSING");
      const l = m.lot;
      if (l.unitCostAmount.isZero()) continue;
      await postPair(tx, {
        ...base,
        key: `restock:${m.id}`,
        amount: new Exact(l.unitCostAmount.toString())
          .mul(m.quantity)
          .toFixed(4),
        debit: "inventory",
        credit: "cogs",
        rates: {
          ...base.rates,
          currency: l.unitCostCurrency as Rates["currency"],
          rateTry: new Exact(l.unitCostAmountTry.toString())
            .div(l.unitCostAmount.toString())
            .toFixed(12),
          rateUsd: new Exact(l.unitCostAmountUsd.toString())
            .div(l.unitCostAmount.toString())
            .toFixed(12),
          fxAsOf: l.receivedAt.toISOString(),
          effectiveAt: m.createdAt.toISOString(),
        },
      });
    }
  }
}
