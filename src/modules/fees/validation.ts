import { z } from "zod";
import type { FeeMethod } from "./index";

const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const positive = decimal.refine(
  (value) => value !== "0" && !/^0(?:\.0+)?$/.test(value),
);
const amountBracket = z.object({ uptoKg: positive, amount: decimal });
const valueBracket = z
  .object({
    uptoAmount: positive,
    amount: decimal.optional(),
    percent: decimal.optional(),
  })
  .refine((row) => (row.amount === undefined) !== (row.percent === undefined), {
    message: "Each value bracket needs exactly one amount or percent",
  });

const schemas = {
  FIXED: z.object({ amount: decimal }),
  PERCENT: z.object({
    percent: decimal,
    of: z.enum([
      "subtotal",
      "subtotal_plus_shipping",
      "subtotal_plus_shipping_customs",
    ]),
  }),
  PER_KG: z.object({ perKg: decimal, minKg: decimal.optional() }),
  WEIGHT_BRACKET: z.object({
    brackets: z.array(amountBracket).min(1),
    extraPerKg: decimal,
  }),
  VALUE_BRACKET: z.object({ brackets: z.array(valueBracket).min(1) }),
  PER_ITEM: z.object({ amount: decimal }),
} satisfies Record<FeeMethod, z.ZodType<Record<string, unknown>>>;

export function parseFeeRuleParams(
  method: FeeMethod,
  value: unknown,
): Record<string, unknown> {
  return schemas[method].parse(value);
}
