import Decimal from "decimal.js";
import { z } from "zod";

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const money = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/);
const currency = z.enum(["TRY", "USD", "CAD", "IRT"]);
const dated = z.iso.datetime().nullable();
const inputSchema = z.object({
  currency,
  status: z.string(),
  paidAt: dated,
  subtotal: money,
  fees: money,
  discount: money,
  total: money,
  totalTry: money,
  totalUsd: money,
  fxSnapshot: z.unknown(),
  items: z.array(z.object({ amount: money, currency: z.string() })).min(1),
  feeLines: z.array(
    z.object({ amount: money, currency: z.string(), absorbed: z.boolean() }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      amount: money,
      currency: z.string(),
      method: z.string(),
      status: z.string(),
      reviewedAt: dated,
      reference: z.string(),
    }),
  ),
  creditUses: z.array(
    z.object({
      id: z.string(),
      amount: money,
      currency: z.string(),
      status: z.string(),
    }),
  ),
  returnActivity: z.boolean(),
});
const quoteSchema = z.object({
  marketPerUsd: z
    .string()
    .regex(/^\d{1,18}(\.\d{1,12})?$/)
    .pipe(z.string().refine((s) => new Exact(s).gt(0))),
  tryPerUsd: z
    .string()
    .regex(/^\d{1,18}(\.\d{1,12})?$/)
    .pipe(z.string().refine((s) => new Exact(s).gt(0))),
  quotedAt: z.iso.datetime(),
});
export type ReconciliationInput = z.infer<typeof inputSchema>;
export const reconciliationIssues = [
  "INVALID_DATA",
  "NOT_PAID",
  "ORDER_STATE",
  "ITEM_TOTAL",
  "FEE_TOTAL",
  "ORDER_TOTAL",
  "CURRENCY",
  "PAYMENT_TOTAL",
  "PAYMENT_DATE",
  "PAYMENT_METHOD",
  "CREDIT_HISTORY",
  "FX_MISSING",
  "FX_IDENTITY",
  "FX_TOTAL",
  "FX_PRECISION",
  "RETURN_ACTIVITY",
  "ZERO_TOTAL",
] as const;
export type ReconciliationIssue = (typeof reconciliationIssues)[number];
export type Reconciliation = {
  issues: ReconciliationIssue[];
  totals: null | Record<
    | "items"
    | "chargedFees"
    | "absorbedFees"
    | "netGoods"
    | "expected"
    | "approved"
    | "external"
    | "credit"
    | "other"
    | "difference",
    string
  >;
  fx: null | {
    quotedAt: string;
    marketPerUsd: string;
    tryPerUsd: string;
    expectedTry: string;
    expectedUsd: string;
    ledgerRateTry: string;
    ledgerRateUsd: string;
  };
};

/** Read-only evidence, not authorization to post or a historic backfill plan. */
export function reconcileOrder(raw: unknown): Reconciliation {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    return { issues: ["INVALID_DATA"], totals: null, fx: null };
  const input = parsed.data;
  const issues = new Set<ReconciliationIssue>();
  const sum = (rows: { amount: string }[]) =>
    rows.reduce((n, r) => n.add(r.amount), new Exact(0));
  if (!input.paidAt) issues.add("NOT_PAID");
  if (
    ![
      "PAID",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
      "RETURN_REQUESTED",
      "RETURNED",
    ].includes(input.status)
  )
    issues.add("ORDER_STATE");
  if (new Exact(input.total).isZero()) issues.add("ZERO_TOTAL");
  const items = sum(input.items.filter((i) => i.currency === input.currency));
  const chargedFees = sum(
    input.feeLines.filter((f) => !f.absorbed && f.currency === input.currency),
  );
  const absorbedFees = sum(
    input.feeLines.filter((f) => f.absorbed && f.currency === input.currency),
  );
  const netGoods = new Exact(input.subtotal).sub(input.discount);
  const expected = netGoods.add(chargedFees);
  if (!items.eq(input.subtotal)) issues.add("ITEM_TOTAL");
  if (!chargedFees.eq(input.fees)) issues.add("FEE_TOTAL");
  if (netGoods.lt(0) || !expected.eq(input.total)) issues.add("ORDER_TOTAL");
  const payments = input.payments.filter((p) => p.status === "APPROVED");
  const uses = input.creditUses.filter((c) => c.status === "CONSUMED");
  if (
    [...input.items, ...input.feeLines, ...payments, ...uses].some(
      (r) => r.currency !== input.currency,
    )
  )
    issues.add("CURRENCY");
  // Never add an amount denominated in a different currency to the order total.
  const same = payments.filter((p) => p.currency === input.currency);
  const external = sum(
    same.filter((p) => ["CASH", "OFFLINE_BANK_TRANSFER"].includes(p.method)),
  );
  const credit = sum(same.filter((p) => p.method === "STORE_CREDIT"));
  const other = sum(
    same.filter(
      (p) =>
        !["CASH", "OFFLINE_BANK_TRANSFER", "STORE_CREDIT"].includes(p.method),
    ),
  );
  const approved = sum(same);
  if (!approved.eq(input.total)) issues.add("PAYMENT_TOTAL");
  if (payments.some((p) => !p.reviewedAt)) issues.add("PAYMENT_DATE");
  if (
    payments.some(
      (p) =>
        !["CASH", "OFFLINE_BANK_TRANSFER", "STORE_CREDIT"].includes(p.method),
    )
  )
    issues.add("PAYMENT_METHOD");
  const creditPayments = payments.filter((p) => p.method === "STORE_CREDIT");
  if (
    new Set(payments.map((p) => p.id)).size !== payments.length ||
    new Set(uses.map((c) => c.id)).size !== uses.length ||
    creditPayments.length !== uses.length ||
    uses.some((c) => {
      const matching = creditPayments.filter((p) => p.reference === c.id);
      return (
        matching.length !== 1 ||
        matching[0].currency !== c.currency ||
        !new Exact(matching[0].amount).eq(c.amount)
      );
    })
  )
    issues.add("CREDIT_HISTORY");
  if (
    input.returnActivity ||
    ["REFUNDED", "PARTIALLY_REFUNDED", "RETURN_REQUESTED", "RETURNED"].includes(
      input.status,
    )
  )
    issues.add("RETURN_ACTIVITY");
  let fx: Reconciliation["fx"] = null;
  const quote = quoteSchema.safeParse(input.fxSnapshot);
  if (!quote.success) issues.add("FX_MISSING");
  else {
    const market = new Exact(quote.data.marketPerUsd),
      tr = new Exact(quote.data.tryPerUsd);
    if (
      (input.currency === "USD" && !market.eq(1)) ||
      (input.currency === "TRY" && !market.eq(tr))
    )
      issues.add("FX_IDENTITY");
    // Reproduce the order's original snapshot calculation. Never use current FX,
    // nor convert the rounded USD equivalent back into TRY.
    const usd = new Exact(input.total).div(market);
    const expectedUsd = usd.toFixed(4),
      expectedTry = usd.mul(tr).toFixed(4);
    if (
      !new Exact(expectedUsd).eq(input.totalUsd) ||
      !new Exact(expectedTry).eq(input.totalTry)
    )
      issues.add("FX_TOTAL");
    const ledgerRateUsd = new Exact(1).div(market).toFixed(12);
    const ledgerRateTry = tr.div(market).toFixed(12);
    if (
      new Exact(ledgerRateUsd).lte(0) ||
      new Exact(ledgerRateTry).lte(0) ||
      new Exact(input.total).mul(ledgerRateUsd).toFixed(4) !== expectedUsd ||
      new Exact(input.total).mul(ledgerRateTry).toFixed(4) !== expectedTry
    )
      issues.add("FX_PRECISION");
    fx = {
      ...quote.data,
      expectedTry,
      expectedUsd,
      ledgerRateTry,
      ledgerRateUsd,
    };
  }
  return {
    issues: [...issues],
    fx,
    totals: {
      items: items.toFixed(4),
      chargedFees: chargedFees.toFixed(4),
      absorbedFees: absorbedFees.toFixed(4),
      netGoods: netGoods.toFixed(4),
      expected: expected.toFixed(4),
      approved: approved.toFixed(4),
      external: external.toFixed(4),
      credit: credit.toFixed(4),
      other: other.toFixed(4),
      difference: approved.sub(input.total).toFixed(4),
    },
  };
}
