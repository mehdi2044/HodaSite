import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { validateJournal } from "./calculations";

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const id = z.string().min(1).max(100);
const money = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/);
const rate = z
  .string()
  .regex(/^\d{1,18}(\.\d{1,12})?$/)
  .refine((s) => new Exact(s).gt(0));
const instant = z.iso.datetime().transform((s) => new Date(s));
const currency = z.enum(["TRY", "USD", "CAD", "IRT"]);
export const journalRequest = z
  .object({
    marketId: id,
    requestKey: id,
    memo: z.string().trim().min(1).max(500),
    effectiveAt: instant,
    fxAsOf: instant,
    lines: z
      .array(
        z
          .object({
            accountId: id,
            currency,
            debit: money,
            credit: money,
            rateTry: rate,
            rateUsd: rate,
          })
          .strict(),
      )
      .min(2)
      .max(1000),
  })
  .strict();
export const reversalRequest = z
  .object({
    entryId: id,
    requestKey: id,
    memo: z.string().trim().min(1).max(500),
    effectiveAt: instant,
  })
  .strict();

function amount(s: Decimal.Value) {
  const value = new Exact(s).toDecimalPlaces(4);
  if (value.gte("100000000000000")) throw new Error("AMOUNT_OVERFLOW");
  return value.toFixed(4);
}

export function normalizeJournal(raw: unknown) {
  const input = journalRequest.parse(raw);
  const rates = new Map<string, string>();
  const lines = input.lines.map((line, position) => {
    const d = new Exact(line.debit),
      c = new Exact(line.credit);
    if (d.gt(0) === c.gt(0)) throw new Error("INVALID_JOURNAL_SIDE");
    const rateTry = new Exact(line.rateTry).toFixed(12);
    const rateUsd = new Exact(line.rateUsd).toFixed(12);
    if (
      (line.currency === "TRY" && !new Exact(rateTry).eq(1)) ||
      (line.currency === "USD" && !new Exact(rateUsd).eq(1))
    )
      throw new Error("INVALID_IDENTITY_RATE");
    const signature = `${rateTry}:${rateUsd}`;
    if (rates.has(line.currency) && rates.get(line.currency) !== signature)
      throw new Error("INCONSISTENT_JOURNAL_RATES");
    rates.set(line.currency, signature);
    return {
      accountId: line.accountId,
      currency: line.currency,
      position,
      debit: amount(d),
      credit: amount(c),
      rateTry,
      rateUsd,
      debitTry: amount(d.mul(rateTry)),
      creditTry: amount(c.mul(rateTry)),
      debitUsd: amount(d.mul(rateUsd)),
      creditUsd: amount(c.mul(rateUsd)),
    };
  });
  validateJournal(
    lines.map((l) => ({
      accountId: l.accountId,
      currency: l.currency,
      original: { debit: l.debit, credit: l.credit },
      functional: { debit: l.debitTry, credit: l.creditTry },
      reporting: { debit: l.debitUsd, credit: l.creditUsd },
    })),
  );
  return { ...input, lines };
}

export function journalHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
