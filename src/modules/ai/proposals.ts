import { z } from "zod";
import { AiError } from "./contracts";
export const locales = ["fa", "tr", "en"] as const;
export const textFields = [
  "title",
  "description",
  "specs",
  "care",
  "seoTitle",
  "seoDescription",
  "seoKeywords",
] as const;
export const fieldKeys = textFields.flatMap((f) =>
  locales.map((l) => `${f}.${l}`),
);
export const proposalSchema = z
  .object({
    fields: z
      .array(
        z
          .object({
            key: z.string().min(1).max(130),
            value: z.string().max(5000),
          })
          .strict(),
      )
      .max(60),
    suggestions: z.array(z.string().max(300)).max(10),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
const normalize = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .toLocaleLowerCase("en-US");
const fabrics = [
  /\bwool\b|\byün\b|پشم/iu,
  /\bcotton\b|\bpamuk\b|پنبه/iu,
  /\bsilk\b|\bipek\b|ابریشم/iu,
  /\bcashmere\b|\bkaşmir\b|کشمیر/iu,
  /\blinen\b|\bketen\b|کتان/iu,
  /\bpolyester\b|پلی[‌ -]?استر/iu,
  /\bleather\b|\bderi\b|چرم/iu,
  /\bviscose\b|\bviskon\b|ویسکوز/iu,
  /\bnylon\b|\bnaylon\b|نایلون/iu,
  /\belastane\b|\belastan\b|الاستین/iu,
];
function measurementClaims(text: string) {
  const aliases: [RegExp, string][] = [
    [/%|٪|درصد|yüzde/u, "%"],
    [/cm|سانتی(?:متر)?|santimetre/u, "cm"],
    [/mm|میلی(?:متر)?|milimetre/u, "mm"],
    [/kg|کیلوگرم|kilogram/u, "kg"],
    [/gram|grams|گرم|\bg\b/u, "g"],
  ];
  const result = new Set<string>();
  for (const match of text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(%|٪|درصد|yüzde|cm|mm|kg|grams?|سانتی(?:متر)?|میلی(?:متر)?|کیلوگرم|گرم|santimetre|milimetre|kilogram)\s*([^,.;\n]{0,25})/gu,
  )) {
    const unit = aliases.find(([r]) => r.test(match[2]))?.[1] ?? match[2];
    const fabric =
      unit === "%" ? fabrics.findIndex((f) => f.test(match[3])) : -1;
    result.add(`${match[1].replace(",", ".")}:${unit}:${fabric}`);
  }
  return result;
}
export function guardProposal(
  proposal: Proposal,
  facts: unknown,
  categoryIds: string[],
  mediaIds: string[],
) {
  const source = normalize(JSON.stringify(facts));
  const sourceMeasurements = measurementClaims(source);
  const keys = new Set([
    ...fieldKeys,
    "tags",
    "categoryId",
    "attributes",
    ...mediaIds.flatMap((id) => locales.map((l) => `alt.${id}.${l}`)),
  ]);
  const seen = new Set<string>();
  const numbers = new Set(source.match(/\d+(?:[.,]\d+)?/g) ?? []);
  for (const field of proposal.fields) {
    if (!keys.has(field.key) || seen.has(field.key))
      throw new AiError("INVALID_RESPONSE");
    seen.add(field.key);
    if (field.key === "categoryId") {
      if (field.value && !categoryIds.includes(field.value))
        throw new AiError("INVALID_RESPONSE");
      continue;
    }
    const value = normalize(field.value);
    if (/[<>]/.test(value) || /https?:\/\/|javascript:/i.test(value))
      throw new AiError("UNSUPPORTED_CLAIM");
    if ((value.match(/\d+(?:[.,]\d+)?/g) ?? []).some((n) => !numbers.has(n)))
      throw new AiError("UNSUPPORTED_CLAIM");
    if ([...measurementClaims(value)].some((c) => !sourceMeasurements.has(c)))
      throw new AiError("UNSUPPORTED_CLAIM");
    if (fabrics.some((f) => f.test(value) && !f.test(source)))
      throw new AiError("UNSUPPORTED_CLAIM");
    if (field.key === "attributes")
      attributesSchema.parse(JSON.parse(field.value || "[]"));
  }
}
export const attributesSchema = z
  .array(
    z
      .object({
        key: z.string().min(1).max(60),
        valueI18n: z
          .object({
            fa: z.string().max(500),
            tr: z.string().max(500),
            en: z.string().max(500),
          })
          .strict(),
      })
      .strict(),
  )
  .max(20);
export const generationSchema = z
  .object({
    requestKey: z.string().min(8).max(100),
    productId: z.string().min(1).max(100).optional(),
    task: z.enum(["generate", "improve", "shorten", "translate", "field"]),
    field: z.string().max(130).optional(),
    facts: z.record(z.string(), z.unknown()),
    mediaIds: z.array(z.string().min(1).max(100)).max(2),
    vision: z.boolean().default(false),
  })
  .strict();
