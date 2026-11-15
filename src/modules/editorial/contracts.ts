import { z } from "zod";

export const audiences = ["WOMEN", "MEN", "GIRLS", "BOYS"] as const;
export const seasons = ["SPRING", "SUMMER", "AUTUMN", "WINTER"] as const;
export const occasions = ["EVERYDAY", "WORK", "PARTY", "TRAVEL"] as const;
export const styles = ["CASUAL", "CLASSIC", "SPORT", "FORMAL"] as const;
export const colors = ["NEUTRAL", "DARK", "PASTEL", "BRIGHT"] as const;
export const articleCategories = [
  "TRENDS",
  "STYLING",
  "SHOPPING",
  "EVERYDAY",
  "FORMAL",
  "KIDS",
  "COLOR",
  "FITTING",
  "COLLECTIONS",
] as const;
export const slots = ["MAIN", ...audiences] as const;
export const locales = ["fa", "tr", "en"] as const;
export const editorialId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const slugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const slug = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .transform((value) => value.normalize("NFC").toLowerCase())
  .pipe(z.string().regex(slugPattern));
const localized = (value: z.ZodString) =>
  z.object({ fa: value, tr: value, en: value }).strict();
export const entrySlugs = z.object({ fa: slug, tr: slug, en: slug }).strict();
const localizedTitle = localized(z.string().trim().min(1).max(160));
const localizedText = localized(z.string().trim().min(1).max(3000));
const point = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .strict();
export const lookItem = z
  .object({
    productId: editorialId,
    variantId: editorialId,
    desktop: point.optional(),
    mobile: point.optional(),
  })
  .strict();

const base = {
  title: localizedTitle,
  summary: localizedText,
  mediaId: editorialId,
  mobileMediaId: editorialId.optional(),
  focal: point.optional(),
  marketIds: z
    .array(editorialId)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  featured: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(60)).max(15),
};
const articleBlock = z.discriminatedUnion("type", [
  z
    .object({
      type: z.enum(["HEADING", "PARAGRAPH", "QUOTE"]),
      text: localizedText,
    })
    .strict(),
  z
    .object({
      type: z.literal("IMAGE"),
      mediaId: editorialId,
      caption: localizedTitle,
    })
    .strict(),
  z.object({ type: z.literal("LOOK"), id: editorialId }).strict(),
  z.object({ type: z.literal("PRODUCT"), id: editorialId }).strict(),
]);
export const editorialContent = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("LOOK"),
      audience: z.enum(audiences),
      season: z.enum(seasons),
      occasion: z.enum(occasions),
      style: z.enum(styles),
      color: z.enum(colors),
      items: z
        .array(lookItem)
        .min(1)
        .max(12)
        .refine(
          (items) =>
            new Set(items.map(({ productId }) => productId)).size ===
            items.length,
        ),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("ARTICLE"),
      category: z.enum(articleCategories),
      audience: z.enum(audiences),
      author: z.string().trim().min(1).max(160),
      blocks: z.array(articleBlock).min(1).max(80),
      seoTitle: localizedTitle.optional(),
      seoDescription: localizedText.optional(),
      ogMediaId: editorialId.optional(),
    })
    .strict(),
]);
export type EditorialContent = z.infer<typeof editorialContent>;
export type LookContent = Extract<EditorialContent, { kind: "LOOK" }>;
export type ArticleContent = Extract<EditorialContent, { kind: "ARTICLE" }>;
export type EditorialLocale = (typeof locales)[number];
export type EditorialKind = EditorialContent["kind"];
export const selectedVariants = z
  .array(editorialId)
  .min(1)
  .max(12)
  .refine((ids) => new Set(ids).size === ids.length);

// Istanbul has used UTC+03:00 permanently since 2016. Accept future civil
// schedules only and reject JS Date normalization of impossible dates.
export const istanbulTime = z
  .string()
  .regex(/^20[2-9]\d-\d\d-\d\dT\d\d:\d\d$/)
  .refine((value) => {
    const utc = new Date(value + "Z");
    return (
      Number.isFinite(utc.getTime()) && utc.toISOString().slice(0, 16) === value
    );
  })
  .transform((value) => new Date(value + "+03:00"));

export function readJson(value: unknown): unknown {
  try {
    return JSON.parse(z.string().max(180000).parse(value));
  } catch {
    throw new z.ZodError([]);
  }
}
