import { createHash } from "node:crypto";
import { z } from "zod";
import { promotionRevisionSchema } from "./contracts";

export const promotionIdSchema = z.string().regex(/^[\w-]{1,100}$/);
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{3,63}$/);
export const couponCodesSchema = z
  .array(couponCodeSchema)
  .max(100)
  .refine((v) => new Set(v).size === v.length, "Duplicate coupon codes")
  .transform((v) => v.sort());
const copy = z
  .object({
    fa: z.string().trim().min(1).max(300),
    tr: z.string().trim().min(1).max(300),
    en: z.string().trim().min(1).max(300),
  })
  .strict();
const description = z
  .object({
    fa: z.string().max(2000),
    tr: z.string().max(2000),
    en: z.string().max(2000),
  })
  .strict();
export const saveProgramSchema = z
  .object({
    id: promotionIdSchema.optional(),
    marketId: promotionIdSchema,
    expectedVersion: z.number().int().min(0).max(10000000),
    mutationKey: z.uuid(),
    confirmed: z.literal(true),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000),
    category: z.string().trim().min(1).max(100),
    ownerNotes: z.string().max(4000),
    titleI18n: copy,
    descriptionI18n: description,
    config: z.object(promotionRevisionSchema.shape).strict().omit({
      id: true,
      revision: true,
      marketId: true,
      currency: true,
    }),
  })
  .strict()
  .refine(
    (v) => Boolean(v.id) === v.expectedVersion > 0,
    "Version required for update",
  )
  .refine(
    (v) =>
      v.config.endsAt === null ||
      Date.parse(v.config.startsAt) < Date.parse(v.config.endsAt),
    "End must follow start",
  );

export const issueCouponsSchema = z
  .object({
    programId: promotionIdSchema,
    marketId: promotionIdSchema,
    mutationKey: z.uuid(),
    confirmed: z.literal(true),
    codes: couponCodesSchema,
    generateCount: z.number().int().min(0).max(100),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
    totalUsageCap: z.number().int().min(0).max(10000000).nullable(),
    perCustomerCap: z.number().int().min(0).max(10000000).nullable(),
  })
  .strict()
  .refine(
    (v) => v.codes.length > 0 !== v.generateCount > 0,
    "Choose codes or generation",
  )
  .refine(
    (v) => v.endsAt === null || Date.parse(v.startsAt) < Date.parse(v.endsAt),
    "End must follow start",
  );

export const couponStatusSchema = z
  .object({
    marketId: promotionIdSchema,
    id: promotionIdSchema,
    expectedVersion: z.number().int().positive(),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]),
    confirmed: z.literal(true),
  })
  .strict();

// Canonical hashing avoids field-order differences on network retry.
export function requestHash(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, canonical(x)]),
      );
    return v;
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export class PromotionError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "STALE_VERSION"
      | "IDEMPOTENCY_CONFLICT"
      | "ARCHIVED"
      | "INVALID_REFERENCE"
      | "LIMIT"
      | "ORDER_MISMATCH"
      | "RELEASE_FORBIDDEN",
  ) {
    super(code);
    this.name = "PromotionError";
  }
}
