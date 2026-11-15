import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getRequestContext } from "@/lib/request-context";
import { seoPath } from "@/lib/seo-urls";
import { locales, type EditorialLocale } from "@/modules/editorial/contracts";
import {
  editorialSlug,
  publishedBySlug,
  publishedEntries,
} from "@/modules/editorial/queries";
import { editorialMetadata } from "@/modules/editorial/metadata";
import { CuratedDetail } from "@/components/storefront/curated-detail";

type Params = { locale: EditorialLocale; slug: string };
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale, slug } = await params;
  if (!locales.includes(locale)) return {};
  return editorialMetadata(
    "looks",
    slug,
    locale,
    (await getRequestContext(locale)).market,
  );
}

export default async function LookPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ story?: string }>;
}) {
  const { locale, slug } = await params;
  if (!locales.includes(locale)) notFound();
  const { market, markets } = await getRequestContext(locale);
  const look = await publishedBySlug("LOOK", locale, slug, market.id);
  if (look?.body.kind !== "LOOK") notFound();
  const audience = look.body.audience;
  const { story } = await searchParams;
  const [t, related, articles] = await Promise.all([
    getTranslations("editorial"),
    publishedEntries("LOOK", market.id),
    publishedEntries("ARTICLE", market.id),
  ]);
  const same = related
    .filter((entry) => entry.id !== look.id && entry.body.audience === audience)
    .slice(0, 4);
  const stories = articles
    .filter(
      (entry) =>
        entry.body.kind === "ARTICLE" &&
        entry.body.blocks.some(
          (block) => block.type === "LOOK" && block.id === look.id,
        ),
    )
    .slice(0, 4);
  return (
    <main className="shell editorial-page">
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
              (look.body.marketIds.length &&
                !look.body.marketIds.includes(destination.id))
            )
              return null;
            return (
              <a
                key={language}
                lang={language}
                href={seoPath(
                  language,
                  destination.code,
                  "looks",
                  editorialSlug(look, language),
                )}
              >
                {t(`locale.${language}`)}
              </a>
            );
          })}
      </div>
      <CuratedDetail
        body={look.body}
        locale={locale}
        market={market}
        id={look.id}
        revisionId={look.revision.id}
        visual={look.visual}
        story={
          typeof story === "string" && story.length <= 96 ? story : undefined
        }
      />
      {[
        { rows: same, route: "looks", key: "relatedLooks" },
        { rows: stories, route: "magazine", key: "relatedArticles" },
      ].map(
        ({ rows, route, key }) =>
          rows.length > 0 && (
            <section className="editorial-related" key={key}>
              <h2>{t(key)}</h2>
              {rows.map((entry) => (
                <Link
                  key={entry.id}
                  href={seoPath(
                    locale,
                    market.code,
                    route as "looks" | "magazine",
                    editorialSlug(entry, locale),
                  )}
                >
                  {entry.body.title[locale]}
                </Link>
              ))}
            </section>
          ),
      )}
    </main>
  );
}
