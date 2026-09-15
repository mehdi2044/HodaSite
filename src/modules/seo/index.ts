import type { Metadata } from "next";
import { getMarkets, getSiteSettings } from "@/modules/settings";
import { normalizeBrand } from "@/lib/brand";
import {
  localized,
  normalizeSeo,
  SEO_LOCALES,
  seoPath,
  type SeoKind,
  type SeoLocale,
} from "@/lib/seo";
export { getSitemapIndex, getSitemapPage } from "./sitemaps";
export async function getSeoSettings() {
  return normalizeSeo((await getSiteSettings())?.seo);
}
export async function publicMetadata(input: {
  locale: SeoLocale;
  marketId: string;
  kind: SeoKind;
  slugs?: unknown;
  marketIds?: string[];
  title?: string;
  description?: string;
  noindex?: boolean;
  page?: number;
  images?: string[];
}): Promise<Metadata> {
  const [site, markets] = await Promise.all([getSiteSettings(), getMarkets()]);
  const settings = normalizeSeo(site?.seo);
  const market = markets.find((m) => m.id === input.marketId && m.isActive);
  if (!market) return { robots: { index: false, follow: false } };
  const brand = normalizeBrand(site?.brand);
  const marketSeo = (
    market.seo && typeof market.seo === "object" ? market.seo : {}
  ) as { title?: unknown; description?: unknown };
  const title =
    input.title ||
    localized(marketSeo.title, input.locale) ||
    settings.title[input.locale] ||
    brand.name[input.locale] ||
    brand.name.fa;
  const description =
    input.description ||
    localized(marketSeo.description, input.locale) ||
    settings.description[input.locale] ||
    undefined;
  const visible = markets.filter(
    (m) =>
      m.isActive &&
      (input.marketIds === undefined || input.marketIds.includes(m.id)),
  );
  const languages: Record<string, string> = {};
  const pageQuery = input.page && input.page > 1 ? `?page=${input.page}` : "";
  if (settings.origin && !pageQuery)
    for (const m of visible)
      for (const locale of SEO_LOCALES) {
        if (
          !m.enabledLocales.includes(locale) ||
          (input.kind !== "home" && !localized(input.slugs, locale))
        )
          continue;
        // Region subtags require a two-letter country code; custom test markets
        // are not advertised as countries. They still get their own canonical.
        if (!/^[A-Z]{2}$/.test(m.code)) continue;
        languages[`${locale}-${m.code}`] =
          settings.origin +
          seoPath(locale, m.code, input.kind, localized(input.slugs, locale)) +
          pageQuery;
      }
  const canonical = settings.origin
    ? settings.origin +
      seoPath(
        input.locale,
        market.code,
        input.kind,
        localized(input.slugs, input.locale),
      ) +
      pageQuery
    : undefined;
  return {
    title,
    description,
    robots: { index: settings.indexingEnabled && !input.noindex, follow: true },
    alternates: canonical ? { canonical, languages } : undefined,
    openGraph: {
      title,
      description,
      siteName: brand.name[input.locale] || brand.name.fa,
      url: canonical,
      type: "website",
      images: input.images,
    },
    twitter: {
      card: input.images?.length ? "summary_large_image" : "summary",
      title,
      description,
      images: input.images,
    },
  };
}
