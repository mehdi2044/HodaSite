import Decimal from "decimal.js";
import { z } from "zod";

// Private precision: evaluating a definition must not change global money math.
export const PromotionDecimal = Decimal.clone({ precision: 50 });
const id = z.string().regex(/^[\w-]{1,100}$/);
const ids = z
  .array(id)
  .max(100)
  .refine((xs) => new Set(xs).size === xs.length);
export const promotionAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/);
const positiveAmount = promotionAmountSchema.refine((v) =>
  new PromotionDecimal(v).gt(0),
);
const count = z.number().int().min(0).max(10000000);
const quantity = z.number().int().min(1).max(1000000);
const currency = z.enum(["USD", "TRY", "CAD", "IRT"]);
const locale = z.enum(["fa", "tr", "en"]);
const channel = z.enum(["email", "sms", "whatsapp", "telegram", "push"]);
const time = z.iso.datetime();
const comparison = z.enum(["gte", "lte", "eq"]);

export const promotionSelectorSchema = z
  .object({
    productIds: ids,
    categoryIds: ids,
    collectionIds: ids,
    excludedProductIds: ids,
    excludedCategoryIds: ids,
    excludedCollectionIds: ids,
  })
  .strict();

export const promotionConditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("market"), value: id }).strict(),
  z.object({ field: z.literal("locale"), value: locale }).strict(),
  z.object({ field: z.literal("segment"), value: id }).strict(),
  z
    .object({ field: z.literal("orders"), op: comparison, value: count })
    .strict(),
  z
    .object({
      field: z.literal("subtotal"),
      op: comparison,
      value: promotionAmountSchema,
    })
    .strict(),
  z
    .object({ field: z.literal("quantity"), op: comparison, value: count })
    .strict(),
  z.object({ field: z.literal("product"), value: id }).strict(),
  z.object({ field: z.literal("category"), value: id }).strict(),
  z.object({ field: z.literal("collection"), value: id }).strict(),
  z
    .object({
      field: z.literal("tag"),
      value: z.string().trim().min(1).max(60),
    })
    .strict(),
  z
    .object({
      field: z.literal("consent"),
      channel,
      value: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
    })
    .strict(),
]);

export const promotionEffectSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("percent"),
      percent: positiveAmount.refine((v) => new PromotionDecimal(v).lte(100)),
    })
    .strict(),
  z.object({ type: z.literal("fixed"), amount: positiveAmount }).strict(),
  z.object({ type: z.literal("freeShipping") }).strict(),
  z
    .object({ type: z.literal("buyXGetY"), buy: quantity, get: quantity })
    .strict(),
  z
    .object({
      type: z.literal("spendXGetY"),
      spend: positiveAmount,
      amount: positiveAmount,
      maxSets: quantity.nullable(),
    })
    .strict(),
]);

export const promotionDefinitionSchema = z
  .object({
    version: z.literal(1),
    conditions: z.array(promotionConditionSchema).max(24),
    selector: promotionSelectorSchema,
    effect: promotionEffectSchema,
    maxDiscount: positiveAmount.nullable(),
  })
  .strict();

/** A server-loaded immutable revision, not an admin write or HTTP contract. */
export const promotionRevisionSchema = z
  .object({
    id,
    revision: z.number().int().min(1).max(10000000),
    marketId: id,
    currency,
    enabled: z.boolean(),
    status: z.enum([
      "DRAFT",
      "STAGED",
      "SCHEDULED",
      "ACTIVE",
      "PAUSED",
      "ARCHIVED",
    ]),
    startsAt: time,
    endsAt: time.nullable(),
    priority: z.number().int().min(-1000000).max(1000000),
    group: id,
    stacking: z.enum(["STACKABLE", "EXCLUSIVE_GROUP"]),
    excludes: ids,
    couponRequired: z.boolean(),
    totalUsageCap: count.nullable(),
    perCustomerCap: count.nullable(),
    budget: promotionAmountSchema.nullable(),
    definition: promotionDefinitionSchema,
  })
  .strict()
  .refine(
    (v) => v.endsAt === null || Date.parse(v.startsAt) < Date.parse(v.endsAt),
    {
      message: "End must follow start",
      path: ["endsAt"],
    },
  );

const itemSchema = z
  .object({
    variantId: id,
    productId: id,
    categoryId: id.nullable(),
    collectionIds: ids,
    quantity,
    unitPrice: promotionAmountSchema,
  })
  .strict();

export const promotionContextSchema = z
  .object({
    marketId: id,
    currency,
    locale,
    now: time,
    items: z
      .array(itemSchema)
      .min(1)
      .max(100)
      .refine(
        (xs) => new Set(xs.map((x) => x.variantId)).size === xs.length,
        "Combine duplicate variants first",
      ),
    // Charged shipping only; the adapter must exclude absorbed/non-shipping fees.
    shippingAmount: promotionAmountSchema,
    customer: z
      .object({
        id,
        marketId: id,
        orderCount: count.nullable(),
        segmentIds: ids,
        tags: z.array(z.string().min(1).max(60)).max(100),
        consents: z
          .object({
            email: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
            sms: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
            whatsapp: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
            telegram: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
            push: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    verifiedCoupons: z
      .array(z.object({ promotionId: id, revision: count }).strict())
      .max(100),
    usage: z
      .array(
        z
          .object({
            promotionId: id,
            revision: count,
            totalUsed: count,
            customerId: id.nullable(),
            customerUsed: count.nullable(),
            spent: promotionAmountSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .refine((v) => !v.customer || v.customer.marketId === v.marketId, {
    message: "Customer evidence belongs to another market",
    path: ["customer", "marketId"],
  })
  .refine(
    (v) => new Set(v.usage.map((u) => u.promotionId)).size === v.usage.length,
    {
      message: "Duplicate usage evidence",
      path: ["usage"],
    },
  );

export const promotionBatchSchema = z
  .array(promotionRevisionSchema)
  .max(100)
  .refine(
    (xs) => new Set(xs.map((x) => x.id)).size === xs.length,
    "Duplicate promotion revisions",
  );

export type PromotionRevision = z.infer<typeof promotionRevisionSchema>;
export type PromotionContext = z.infer<typeof promotionContextSchema>;
export type PromotionCondition = z.infer<typeof promotionConditionSchema>;
export type PromotionSelector = z.infer<typeof promotionSelectorSchema>;
export type PromotionItem = z.infer<typeof itemSchema>;
