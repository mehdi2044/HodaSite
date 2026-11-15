import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getRequestContext } from "@/lib/request-context";
import { normalizeSeo } from "@/lib/seo";
import { seoPath } from "@/lib/seo-urls";
import { getSiteSettings } from "@/modules/settings";
import { jsonLdText } from "@/modules/seo/structured";
import { locales, type EditorialLocale } from "@/modules/editorial/contracts";
import {
  editorialSlug,
  publishedBySlug,
  publishedEntries,
  readyImages,
} from "@/modules/editorial/queries";
import { editorialMetadata } from "@/modules/editorial/metadata";
import { MagazineArticle } from "@/components/storefront/magazine-article";

type Params = { locale: EditorialLocale; slug: string };
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale, slug } = await params;
  if (!locales.includes(locale)) return {};
  return editorialMetadata(
    "magazine",
    slug,
    locale,
    (await getRequestContext(locale)).market,
  );
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale, slug } = await params;
  if (!locales.includes(locale)) notFound();
  const { market, markets } = await getRequestContext(locale);
  const article = await publishedBySlug("ARTICLE", locale, slug, market.id);
  if (article?.body.kind !== "ARTICLE") notFound();
  const body = article.body;
  const [t, related, settings, [image]] = await Promise.all([
    getTranslations("editorial"),
    publishedEntries("ARTICLE", market.id),
    getSiteSettings(),
    readyImages([body.ogMediaId ?? body.mediaId]),
  ]);
  const origin = normalizeSeo(settings?.seo).origin;
  const canonical = seoPath(locale, market.code, "magazine", slug);
  const links = related
    .filter(
      ({ id, body: item }) =>
        id !== article.id &&
        item.kind === "ARTICLE" &&
        (item.category === body.category || item.audience === body.audience),
    )
    .slice(0, 4);
  return (
    <main className="shell editorial-page">
      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdText({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: body.title[locale],
              description: body.summary[locale],
              inLanguage: locale,
              datePublished: article.revision.visibleFrom?.toISOString(),
              dateModified: article.revision.updatedAt.toISOString(),
              author: { "@type": "Person", name: body.author },
              mainEntityOfPage: origin + canonical,
              ...(image ? { image: new URL(image.url, origin).href } : {}),
            }),
          }}
        />
      )}
      <div className="editorial-link-row">
        {locales
          .filter((language) => language !== locale)
          .map((language) => {
            const destination =
              markets.find(
                (m) =>
                  m.id === market.id && m.enabledLocales.includes(language),
              ) ??
              markets.find((m) => m.isActive && m.defaultLocale === language);
            if (
              !destination ||
              (body.marketIds.length &&
                !body.marketIds.includes(destination.id))
            )
              return null;
            return (
              <a
                key={language}
                lang={language}
                href={seoPath(
                  language,
                  destination.code,
                  "magazine",
                  editorialSlug(article, language),
                )}
              >
                {t(`locale.${language}`)}
              </a>
            );
          })}
      </div>
      <MagazineArticle
        body={body}
        market={market}
        locale={locale}
        slug={slug}
        visibleFrom={article.revision.visibleFrom}
      />
      {links.length > 0 && (
        <section className="editorial-section">
          <h2>{t("relatedArticles")}</h2>
          <div className="editorial-link-row">
            {links.map((entry) => (
              <Link
                key={entry.id}
                href={seoPath(
                  locale,
                  market.code,
                  "magazine",
                  editorialSlug(entry, locale),
                )}
              >
                {entry.body.title[locale]}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
