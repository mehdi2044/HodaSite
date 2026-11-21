import { chooseHomepageArticle } from "@/modules/editorial/home-selection";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import { getMarketByCode } from "@/modules/settings";
import {
  homepageWeeklyLooks,
  homepagePublishedArticles,
} from "@/modules/editorial/homepage-queries";
import { editorialSlug, readyImages } from "@/modules/editorial/queries";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { supportsLookFitting } from "@/modules/editorial/fitting";
import type { Moda4Block } from "@/modules/content/moda4-contracts";
import { localizedValue } from "@/modules/content/homepage";
import { CuratedCard } from "./curated-card";
import { EditorialImage } from "./editorial-image";

export async function HomeEditorialSpotlight({
  block,
  locale,
  marketCode,
  excludedTopicLookIds = [],
  excludedPhotoIds = [],
}: {
  block: Extract<Moda4Block, { type: "EditorialSpotlight" }>;
  locale: "fa" | "tr" | "en";
  marketCode: string;
  excludedTopicLookIds?: string[];
  excludedPhotoIds?: string[];
}) {
  const market = await getMarketByCode(marketCode);
  if (!market) return null;
  const [t, h, weeklyRows, articles] = await Promise.all([
    getTranslations({ locale, namespace: "editorial" }),
    getTranslations({ locale, namespace: "modaHomepage" }),
    homepageWeeklyLooks(market.id),
    homepagePublishedArticles(market.id),
  ]);
  const weekly = weeklyRows.find(({ row }) => row.slot === "MAIN")?.look;
  const article = chooseHomepageArticle(
    articles,
    block.articleId,
    excludedTopicLookIds,
    excludedPhotoIds,
  );
  const [[commerce], fitting, images] = await Promise.all([
    weekly ? resolveLookCommerce([weekly.body], market, locale) : [],
    weekly ? supportsLookFitting(weekly.body) : false,
    article
      ? readyImages([
          article.body.mediaId,
          article.body.mobileMediaId ?? article.body.mediaId,
        ])
      : [],
  ]);
  const desktop =
    article && images.find((image) => image.id === article.body.mediaId);
  const mobile =
    article && images.find((image) => image.id === article.body.mobileMediaId);
  return (
    <section
      className="home-editorial-spotlight"
      data-moda4="editorial-spotlight"
    >
      <header className="home-experience-heading">
        <h2>{localizedValue(block.title, locale)}</h2>
        <Link href={seoPath(locale, market.code, "magazine")}>
          {t("magazine")} ↗
        </Link>
      </header>
      <div
        className="home-spotlight-grid"
        data-has-weekly={Boolean(weekly)}
        data-has-article={Boolean(article)}
      >
        {weekly && commerce ? (
          <div
            className="home-spotlight-weekly"
            data-weekly-look-id={weekly.id}
          >
            <CuratedCard
              look={weekly}
              locale={locale}
              market={market}
              commerce={commerce}
              weekly
              fitting={fitting}
              t={t}
              heading="h3"
              showSummary
            />
          </div>
        ) : (
          <div className="home-spotlight-empty">
            <p>{t("weeklyEmpty")}</p>
            <Link href={seoPath(locale, market.code, "looks")}>
              {t("gallery")} ↗
            </Link>
          </div>
        )}
        {article ? (
          <article
            className="home-spotlight-article"
            data-article-id={article.id}
          >
            {desktop || mobile ? (
              <Link
                className="home-spotlight-article-image"
                href={seoPath(
                  locale,
                  market.code,
                  "magazine",
                  editorialSlug(article, locale),
                )}
                aria-label={article.body.title[locale]}
              >
                <EditorialImage
                  desktop={desktop || undefined}
                  mobile={mobile || undefined}
                  focal={article.body.focal}
                  locale={locale}
                />
              </Link>
            ) : (
              <div className="home-spotlight-image-empty">
                <p>{h("spotlightImagePending")}</p>
              </div>
            )}
            <div className="home-spotlight-article-copy">
              <p className="editorial-kicker">{t("magazine")}</p>
              <h3>{article.body.title[locale]}</h3>
              <p>{article.body.summary[locale]}</p>
              <Link
                className="home-spotlight-read"
                href={seoPath(
                  locale,
                  market.code,
                  "magazine",
                  editorialSlug(article, locale),
                )}
              >
                {t("readArticle")} ↗
              </Link>
            </div>
          </article>
        ) : (
          <div className="home-spotlight-empty">
            <div>
              <h3>{t("magazine")}</h3>
              <p>{h("spotlightEmpty")}</p>
            </div>
            <Link href={seoPath(locale, market.code, "magazine")}>
              {t("magazine")} ↗
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
