import Decimal from "decimal.js";
import { z } from "zod";
export const coins = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/)
  .refine((v) => new Decimal(v).gte(0));
const positive = coins.refine((v) => new Decimal(v).gt(0));
const localized = z.object({
  fa: z.string().trim().min(1).max(120),
  tr: z.string().trim().min(1).max(120),
  en: z.string().trim().min(1).max(120),
});
export const modelSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  label: localized,
  kind: z.enum(["WOMAN", "MAN", "GIRL", "BOY"]),
  mediaId: z.string().min(1),
  enabled: z.boolean(),
});
export const configSchema = z
  .object({
    enabled: z.boolean().default(false),
    coinSalesEnabled: z.boolean().default(false),
    provider: z.literal("openai").default("openai"),
    model: z.enum(["gpt-image-1.5", "gpt-image-2"]).default("gpt-image-1.5"),
    quality: z.enum(["low", "medium", "high"]).default("medium"),
    costCoins: positive.default("12.5"),
    welcomeCoins: coins.default("62.5"),
    dailyFreeUses: z.number().int().min(0).max(100).default(2),
    dailyLimit: z.number().int().min(0).max(100).default(10),
    globalDailyLimit: z.number().int().min(1).max(10000).default(500),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      })
      .default("Europe/Istanbul"),
    models: z
      .array(modelSchema)
      .max(40)
      .default([])
      .refine((v) => new Set(v.map((m) => m.id)).size === v.length),
    rewards: z
      .array(
        z.object({
          marketId: z.string().min(1),
          spendAmount: positive,
          coins: positive,
        }),
      )
      .max(3)
      .default([])
      .refine((v) => new Set(v.map((m) => m.marketId)).size === v.length),
  })
  .strict();
export type FittingConfig = z.infer<typeof configSchema>;
export class FittingError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const requestSchema = z
  .object({
    requestKey: z.string().uuid(),
    expectedCostCoins: positive,
    modelId: z.string().min(1).max(64),
    variantIds: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(4)
      .refine((ids) => new Set(ids).size === ids.length),
    confirm: z.literal(true),
  })
  .strict();
export type Allocation = { grantId: string; amount: string };
export type ImageReference = { storageKey: string; mime: string };
export const snapshotSchema = z.object({
  model: z.object({
    kind: z.enum(["WOMAN", "MAN", "GIRL", "BOY"]),
    image: z.object({ storageKey: z.string(), mime: z.string() }),
  }),
  items: z
    .array(
      z.object({
        variantId: z.string(),
        productId: z.string(),
        title: z.string(),
        color: z.string(),
        hex: z.string(),
        size: z.string(),
        owned: z.boolean(),
        image: z.object({ storageKey: z.string(), mime: z.string() }),
      }),
    )
    .min(1)
    .max(4),
  provider: z.literal("openai"),
  modelName: z.string(),
  quality: z.enum(["low", "medium", "high"]),
});
export type FittingSnapshot = z.infer<typeof snapshotSchema>;
export function dayKey(now: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export function dayBounds(now: Date, timezone: string) {
  const key = dayKey(now, timezone);
  let lo = now.getTime(),
    hi = lo + 36 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid), timezone) === key) lo = mid;
    else hi = mid;
  }
  const end = new Date(hi);
  lo = now.getTime() - 36 * 3600000;
  hi = now.getTime();
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid), timezone) === key) hi = mid;
    else lo = mid;
  }
  return { key, start: new Date(hi), end };
}
export function rewardAmount(
  spend: string,
  threshold: string,
  coinsPerStep: string,
) {
  return new Decimal(spend)
    .div(threshold)
    .floor()
    .mul(coinsPerStep)
    .toDecimalPlaces(4)
    .toFixed();
}
export function allocate(
  cost: string,
  grants: { id: string; balance: { toString(): string } }[],
): Allocation[] {
  let remaining = new Decimal(cost);
  const allocations: Allocation[] = [];
  for (const g of grants) {
    const take = Decimal.min(remaining, g.balance.toString());
    if (take.gt(0)) {
      allocations.push({ grantId: g.id, amount: take.toFixed() });
      remaining = remaining.sub(take);
    }
    if (remaining.eq(0)) break;
  }
  if (remaining.gt(0)) throw new FittingError("INSUFFICIENT_COINS");
  return allocations;
}
