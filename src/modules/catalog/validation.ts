import { z } from "zod";
import Decimal from "decimal.js";
import { buildProductSearchText } from "./search";

export const catalogLocales = ["fa", "tr", "en"] as const;
export const localizedRequiredSchema = z.object({
  fa: z.string().trim().min(1).max(5000),
  tr: z.string().trim().min(1).max(5000),
  en: z.string().trim().min(1).max(5000),
});
export const localizedOptionalSchema = z.object({
  fa: z.string().trim().max(5000).default(""),
  tr: z.string().trim().max(5000).default(""),
  en: z.string().trim().max(5000).default(""),
});

const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);
const money = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,4})?$/);

export const variantInputSchema = z.object({
  id: z.string().optional(),
  colorId: z.string().min(1),
  sizeId: z.string().min(1),
  sku: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/),
  barcode: z.string().trim().max(64).optional().default(""),
  priceOverrideUsd: money.optional().or(z.literal("")),
  weightGrams: z.number().int().positive().max(100000).optional(),
  isActive: z.boolean().default(true),
  mediaIds: z.array(z.string()).max(12).default([]),
});

export const productInputSchema = z
  .object({
    id: z.string().optional(),
    titleI18n: localizedRequiredSchema,
    descriptionI18n: localizedRequiredSchema,
    slugI18n: z.object({ fa: slug, tr: slug, en: slug }),
    brandId: z.string().optional().or(z.literal("")),
    categoryId: z.string().min(1),
    collectionIds: z.array(z.string()).max(20).default([]),
    gender: z.enum(["WOMEN", "MEN", "KIDS", "UNISEX"]),
    material: z.string().trim().max(120).optional().default(""),
    fit: z.string().trim().max(120).optional().default(""),
    season: z.string().trim().max(120).optional().default(""),
    careI18n: localizedOptionalSchema,
    originCountry: z
      .string()
      .trim()
      .max(2)
      .regex(/^[A-Z]{2}$/)
      .optional()
      .or(z.literal("")),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    basePriceAmount: money,
    compareAtPriceAmount: money.optional().or(z.literal("")),
    defaultPurchaseCostAmount: money.optional().or(z.literal("")),
    defaultPurchaseCostCurrency: z
      .enum(["USD", "TRY", "CAD", "IRT"])
      .optional(),
    weightGrams: z.number().int().positive().max(100000),
    seoTitleI18n: localizedOptionalSchema,
    seoDescriptionI18n: localizedOptionalSchema,
    seoOgMediaId: z.string().optional().or(z.literal("")),
    marketIds: z.array(z.string()).min(1).max(3),
    mediaIds: z.array(z.string()).max(24).default([]),
    variants: z.array(variantInputSchema).min(1).max(500),
    attributes: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(60),
          valueI18n: localizedRequiredSchema,
        }),
      )
      .max(40)
      .default([]),
  })
  .superRefine((value, context) => {
    const combos = new Set<string>();
    const skus = new Set<string>();
    for (const variant of value.variants) {
      const combo = `${variant.colorId}:${variant.sizeId}`;
      if (combos.has(combo))
        context.addIssue({
          code: "custom",
          path: ["variants"],
          message: "duplicate-combination",
        });
      if (skus.has(variant.sku))
        context.addIssue({
          code: "custom",
          path: ["variants"],
          message: "duplicate-sku",
        });
      combos.add(combo);
      skus.add(variant.sku);
    }
    if (
      value.compareAtPriceAmount &&
      new Decimal(value.compareAtPriceAmount).lessThanOrEqualTo(
        value.basePriceAmount,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["compareAtPriceAmount"],
        message: "compare-at-must-be-higher",
      });
    }
  });

export function productSearchText(input: z.infer<typeof productInputSchema>) {
  return buildProductSearchText([
    ...Object.values(input.titleI18n),
    ...Object.values(input.descriptionI18n),
    input.material,
    input.fit,
    input.season,
    input.originCountry,
    ...input.tags,
    ...input.variants.map((variant) => variant.sku),
  ]);
}

export function slugsAreUnique(
  candidate: Record<(typeof catalogLocales)[number], string>,
  existing: Array<Record<string, string>>,
) {
  return !existing.some((item) =>
    catalogLocales.some((locale) => item[locale] === candidate[locale]),
  );
}
