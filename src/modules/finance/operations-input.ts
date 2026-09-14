import { z } from "zod";
import Decimal from "decimal.js";
export const Exact = Decimal.clone({
  precision: 60,
  rounding: Decimal.ROUND_HALF_UP,
});
export const money = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/);
export const positive = money.refine((v) => new Exact(v).gt(0));
export const identifier = z.string().min(1).max(100);
export const snapshot = z
  .object({
    currency: z.enum(["TRY", "USD", "CAD", "IRT"]),
    rateTry: z
      .string()
      .regex(/^\d{1,18}(\.\d{1,12})?$/)
      .refine((v) => new Exact(v).gt(0)),
    rateUsd: z
      .string()
      .regex(/^\d{1,18}(\.\d{1,12})?$/)
      .refine((v) => new Exact(v).gt(0)),
    fxAsOf: z.iso.datetime(),
    effectiveAt: z.iso.datetime(),
  })
  .refine(
    (v) =>
      (v.currency !== "TRY" || new Exact(v.rateTry).eq(1)) &&
      (v.currency !== "USD" || new Exact(v.rateUsd).eq(1)),
  );
export const operationBase = z.object({
  marketId: identifier,
  requestKey: identifier,
  memo: z.string().trim().min(1).max(500),
  confirm: z.literal(true),
});
export const purchaseInput = operationBase
  .extend({
    snapshot,
    supplierId: identifier,
    warehouseId: identifier,
    additionalCost: money,
    allocation: z.enum(["VALUE", "WEIGHT"]),
    items: z
      .array(
        z.object({
          variantId: identifier,
          quantity: z.number().int().min(1).max(1000000),
          purchaseTotal: positive,
          weight: positive,
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.variantId)).size === v.items.length,
  );
export const expenseInput = operationBase.extend({
  recurringSourceId: identifier.optional(),
  snapshot,
  amount: positive,
  category: z.string().trim().min(1).max(100),
  attachmentId: identifier.optional(),
  recurrenceMonths: z.number().int().min(0).max(12).default(0),
});
export const capitalInput = operationBase.extend({
  snapshot,
  amount: positive,
  partnerId: identifier,
  kind: z.enum(["CONTRIBUTION", "WITHDRAWAL", "PROFIT_SHARE"]),
  purchaseOrderId: identifier.optional(),
});
export function equivalents(
  amount: string,
  rates: { rateTry: string; rateUsd: string },
) {
  const a = new Exact(amount);
  const tr = a.mul(rates.rateTry),
    usd = a.mul(rates.rateUsd);
  if ([a, tr, usd].some((v) => v.abs().gte("100000000000000")))
    throw new Error("AMOUNT_OVERFLOW");
  return { amountTry: tr.toFixed(4), amountUsd: usd.toFixed(4) };
}

/** Preserve month-end cycles without overflowing into the following month. */
export function nextExpenseDate(date: Date, months: number) {
  if (!Number.isInteger(months) || months < 1 || months > 12)
    throw new Error("RECURRENCE_INPUT");
  const result = new Date(date);
  const day = date.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
