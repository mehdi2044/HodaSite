import type { CatalogLocale } from "./queries";

export function catalogText(value: unknown, locale: CatalogLocale) {
  const row = (value ?? {}) as Record<string, string>;
  return row[locale] || row.fa || row.en || row.tr || "";
}

export function catalogSeo(value: unknown, locale: CatalogLocale) {
  const seo = (value ?? {}) as { title?: unknown; description?: unknown };
  return {
    title: catalogText(seo.title, locale),
    description: catalogText(seo.description, locale),
  };
}
