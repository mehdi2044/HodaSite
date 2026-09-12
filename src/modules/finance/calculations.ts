import Decimal from "decimal.js";
import { z } from "zod";
const Exact = Decimal.clone({ precision: 50 });
const amount = z
  .string()
  .regex(/^\d{1,14}(\.\d{1,4})?$/)
  .refine((v) => new Exact(v).isFinite());
const currency = z.enum(["TRY", "USD", "CAD", "IRT"]);
const side = z
  .object({ debit: amount, credit: amount })
  .strict()
  .refine(
    (v) => new Exact(v.debit).isZero() || new Exact(v.credit).isZero(),
  );
export const journalLineSchema = z
  .object({
    accountId: z.string().min(1).max(100),
    currency,
    original: side,
    functional: side,
    reporting: side,
  })
  .strict();
export type JournalLine = z.infer<typeof journalLineSchema>;
export function validateJournal(raw: unknown): JournalLine[] {
  const lines = z.array(journalLineSchema).min(2).max(1000).parse(raw);
  const original = new Map<string, Decimal>();
  let functional = new Exact(0),
    reporting = new Exact(0);
  for (const line of lines) {
    original.set(
      line.currency,
      (original.get(line.currency) ?? new Exact(0))
        .add(line.original.debit)
        .sub(line.original.credit),
    );
    functional = functional
      .add(line.functional.debit)
      .sub(line.functional.credit);
    reporting = reporting.add(line.reporting.debit).sub(line.reporting.credit);
  }
  if (
    [...original.values()].some((v) => !v.isZero()) ||
    !functional.isZero() ||
    !reporting.isZero()
  )
    throw new Error("UNBALANCED_JOURNAL");
  if (
    lines.every((l) =>
      [l.original, l.functional, l.reporting].every(
        (s) => new Exact(s.debit).isZero() && new Exact(s.credit).isZero(),
      ),
    )
  )
    throw new Error("EMPTY_JOURNAL");
  return lines;
}
/** Preserve original amounts and stored currency equivalents when reversing. */
export function reverseJournal(raw: unknown): JournalLine[] {
  return validateJournal(raw).map((line) => ({
    ...line,
    original: { debit: line.original.credit, credit: line.original.debit },
    functional: {
      debit: line.functional.credit,
      credit: line.functional.debit,
    },
    reporting: { debit: line.reporting.credit, credit: line.reporting.debit },
  }));
}
const landedInput = z
  .object({
    additionalCost: amount,
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            quantity: z.number().int().positive().max(1000000000),
            purchaseTotal: amount,
            allocationWeight: z
              .string()
              .regex(/^\d{1,14}(\.\d{1,8})?$/)
              .refine((v) => new Exact(v).gt(0)),
          })
          .strict(),
      )
      .min(1)
      .max(10000),
  })
  .strict();
export function allocateLandedCost(raw: unknown) {
  const input = landedInput.parse(raw);
  if (new Set(input.items.map((i) => i.id)).size !== input.items.length)
    throw new Error("DUPLICATE_ITEM");
  const weight = input.items.reduce(
    (s, i) => s.add(i.allocationWeight),
    new Exact(0),
  );
  const total = new Exact(input.additionalCost);
  const shares = input.items.map((item, index) => {
    const exact = total.mul(item.allocationWeight).div(weight);
    const allocated = exact.toDecimalPlaces(4, Decimal.ROUND_DOWN);
    return { item, index, allocated, remainder: exact.sub(allocated) };
  });
  let remaining = total.sub(
    shares.reduce((s, i) => s.add(i.allocated), new Exact(0)),
  );
  // Largest remainder; ID breaks ties so reordered input cannot redirect pennies.
  const ranked = [...shares].sort(
    (a, b) =>
      b.remainder.comparedTo(a.remainder) ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
  for (const share of ranked) {
    if (remaining.isZero()) break;
    share.allocated = share.allocated.add("0.0001");
    remaining = remaining.sub("0.0001");
  }
  if (!remaining.isZero()) throw new Error("ALLOCATION_PRECISION");
  return shares.map(({ item, allocated }) => {
    const landedTotal = new Exact(item.purchaseTotal).add(allocated);
    if (landedTotal.gte("100000000000000")) throw new Error("AMOUNT_OVERFLOW");
    const unitCost = landedTotal
      .div(item.quantity)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    return {
      id: item.id,
      allocatedCost: allocated.toFixed(4),
      landedTotal: landedTotal.toFixed(4),
      unitCost: unitCost.toFixed(4),
      roundingRemainder: landedTotal
        .sub(unitCost.mul(item.quantity))
        .toFixed(4),
    };
  });
}
