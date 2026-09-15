import { z } from "zod";
export { SEO_LOCALES, seoPath, parseSeoPath, privateSeoPath } from "./seo-urls";
export type { SeoLocale, SeoKind } from "./seo-urls";
const copy = z.object({
  fa: z.string().max(500).default(""),
  tr: z.string().max(500).default(""),
  en: z.string().max(500).default(""),
});
export function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
export const seoSettingsSchema = z
  .object({
    origin: z
      .string()
      .trim()
      .max(2048)
      .default("")
      .refine((v) => !v || Boolean(canonicalOrigin(v)))
      .transform((v) => canonicalOrigin(v) ?? ""),
    indexingEnabled: z.boolean().default(false),
    title: copy.default({ fa: "", tr: "", en: "" }),
    description: copy.default({ fa: "", tr: "", en: "" }),
    googleVerification: z
      .string()
      .trim()
      .max(200)
      .regex(/^[A-Za-z0-9_-]*$/)
      .default(""),
  })
  .refine((v) => !v.indexingEnabled || Boolean(canonicalOrigin(v.origin)));
export type SeoSettings = z.infer<typeof seoSettingsSchema>;
export function normalizeSeo(raw: unknown): SeoSettings {
  const parsed = seoSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : seoSettingsSchema.parse({});
}
export function localized(raw: unknown, locale: string): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const value = (raw as Record<string, unknown>)[locale];
  return typeof value === "string" ? value.trim() : "";
}
export function filteredListing(
  query: Record<string, string | string[] | undefined>,
) {
  return (
    ["brand", "color", "size", "material", "min", "max", "available"].filter(
      (key) => Boolean(query[key]?.length),
    ).length >= 2
  );
}
export function xmlEscape(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
