import { z } from "zod";
import Decimal from "decimal.js";

export const id = z.string().regex(/^[\w-]{1,100}$/);
export const channels = [
  "email",
  "sms",
  "whatsapp",
  "telegram",
  "push",
] as const;
export const channelSchema = z.enum(channels);
export const consentStatus = z.enum(["OPTED_IN", "OPTED_OUT"]);
export const decimal = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/);
const comparison = z.enum(["gte", "lte", "eq"]);
export const ruleSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("market"), value: id }).strict(),
  z
    .object({ field: z.literal("locale"), value: z.enum(["fa", "tr", "en"]) })
    .strict(),
  z
    .object({
      field: z.literal("orders"),
      op: comparison,
      value: z.number().int().min(0).max(10000000),
    })
    .strict(),
  z
    .object({ field: z.literal("value"), op: comparison, value: decimal })
    .strict(),
  z
    .object({ field: z.literal("aov"), op: comparison, value: decimal })
    .strict(),
  z
    .object({
      field: z.literal("lastOrder"),
      op: z.enum(["gte", "lte"]),
      value: z.iso.date(),
    })
    .strict(),
  z.object({ field: z.literal("category"), value: id }).strict(),
  z
    .object({
      field: z.literal("tag"),
      value: z.string().trim().min(1).max(60),
    })
    .strict(),
  z
    .object({
      field: z.literal("consent"),
      channel: channelSchema,
      value: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
    })
    .strict(),
]);
export const segmentSchema = z
  .object({ version: z.literal(1), rules: z.array(ruleSchema).max(12) })
  .strict();
export type SegmentDefinition = z.infer<typeof segmentSchema>;
export const metricsSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    recencyDays: z.array(z.number().int().min(1).max(36500)).length(4),
    frequency: z.array(z.number().int().min(1).max(10000000)).length(4),
    monetaryUsd: z.array(decimal).length(4),
    churnDays: z.number().int().min(1).max(36500),
  })
  .strict()
  .refine(
    (v) =>
      [v.recencyDays, v.frequency, v.monetaryUsd].every((xs) =>
        xs.every((x, i) => !i || new Decimal(x).gt(xs[i - 1])),
      ),
    "Ascending thresholds required",
  );
export type MetricsConfig = z.infer<typeof metricsSchema>;
export function calculateMetrics(
  input: { count: number; valueUsd: string; lastPaidAt: Date | null },
  config: unknown,
  now = new Date(),
) {
  const value = new Decimal(input.valueUsd);
  const recency = input.lastPaidAt
    ? Math.max(
        0,
        Math.floor((now.getTime() - input.lastPaidAt.getTime()) / 86400000),
      )
    : null;
  const parsed = metricsSchema.safeParse(config);
  const basic = {
    orders: input.count,
    valueUsd: value.toFixed(4),
    historicalClvUsd: value.toFixed(4),
    aovUsd: input.count ? value.div(input.count).toFixed(4) : "0.0000",
    recencyDays: recency,
  };
  if (!parsed.success || !input.count || recency === null)
    return { ...basic, rfm: null, churn: "unclassified" as const };
  const c = parsed.data;
  return {
    ...basic,
    rfm: [
      5 - c.recencyDays.filter((x) => recency > x).length,
      1 + c.frequency.filter((x) => input.count >= x).length,
      1 + c.monetaryUsd.filter((x) => value.gte(x)).length,
    ],
    churn: recency >= c.churnDays ? ("atRisk" as const) : ("active" as const),
  };
}

export const privacyKind = z.enum(["EXPORT", "DELETE"]);
export const privacyStatus = z.enum([
  "REQUESTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);
export function validTransition(from: string, to: string, customer = false) {
  if (customer)
    return ["REQUESTED", "IN_REVIEW"].includes(from) && to === "CANCELLED";
  return (
    (from === "REQUESTED" && to === "IN_REVIEW") ||
    (from === "IN_REVIEW" && ["APPROVED", "REJECTED"].includes(to))
  );
}
