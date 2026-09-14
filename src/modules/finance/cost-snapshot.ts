import { z } from "zod";
import { Exact, snapshot } from "./operations-input";

/** Read the original FX evidence, never reconstruct rates from rounded amounts. */
export function costSnapshot(
  currency: string,
  raw: unknown,
  effectiveAt: Date,
) {
  const direct = snapshot.safeParse(raw);
  if (direct.success) {
    if (direct.data.currency !== currency)
      throw new Error("FINANCE_COST_CURRENCY");
    return { ...direct.data, effectiveAt: effectiveAt.toISOString() };
  }
  const legacy = z
    .object({
      base: z.literal("USD"),
      originalCurrency: z.string(),
      originalPerUsd: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .refine((v) => new Exact(v).gt(0)),
      tryPerUsd: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .refine((v) => new Exact(v).gt(0)),
      capturedAt: z.iso.datetime(),
    })
    .parse(raw);
  if (legacy.originalCurrency !== currency)
    throw new Error("FINANCE_COST_CURRENCY");
  return snapshot.parse({
    currency,
    rateTry: new Exact(legacy.tryPerUsd).div(legacy.originalPerUsd).toFixed(12),
    rateUsd: new Exact(1).div(legacy.originalPerUsd).toFixed(12),
    fxAsOf: legacy.capturedAt,
    effectiveAt: effectiveAt.toISOString(),
  });
}
