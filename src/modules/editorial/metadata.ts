import { seoPath } from "@/lib/seo-urls";
import { normalizeSeo } from "@/lib/seo";
import { getSiteSettings } from "@/modules/settings";
import type { Market } from "@/lib/request-context";
import { locales, type EditorialLocale } from "./contracts";
import { editorialSlug, publishedBySlug, readyImages } from "./queries";
import type { Metadata } from "next";

export async function editorialMetadata(
  kind: "looks" | "magazine",
  slug: string,
  locale: EditorialLocale,
  market: Market,
): Promise<Metadata> {
  const [entry, site] = await Promise.all([
    publishedBySlug(
      kind === "looks" ? "LOOK" : "ARTICLE",
      locale,
      slug,
      market.id,
    ),
    getSiteSettings(),
  ]);
  if (!entry) return { robots: { index: false, follow: false } };
  const body = entry.body;
  const settings = normalizeSeo(site?.seo);
  const canonical =
    settings.origin +
    seoPath(locale, market.code, kind, editorialSlug(entry, locale));
  const title =
    body.kind === "ARTICLE"
      ? (body.seoTitle?.[locale] ?? body.title[locale])
      : body.title[locale];
  const description =
    body.kind === "ARTICLE"
      ? (body.seoDescription?.[locale] ?? body.summary[locale])
      : body.summary[locale];
  const [image] = await readyImages([
    body.kind === "ARTICLE" ? (body.ogMediaId ?? body.mediaId) : body.mediaId,
  ]);
  return {
    title,
    description,
    robots: { index: settings.indexingEnabled, follow: true },
    alternates: {
      canonical,
      languages: Object.fromEntries(
        locales
          .filter((language) => market.enabledLocales.includes(language))
          .map((language) => [
            language,
            settings.origin +
              seoPath(
                language,
                market.code,
                kind,
                editorialSlug(entry, language),
              ),
          ]),
      ),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: body.kind === "ARTICLE" ? "article" : "website",
      ...(image && settings.origin
        ? { images: [new URL(image.url, settings.origin).href] }
        : {}),
    },
  };
}
