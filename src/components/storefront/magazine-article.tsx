import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { seoPath } from "@/lib/seo-urls";
import { catalogText } from "@/modules/catalog";
import type { Market } from "@/lib/request-context";
import type {
  ArticleContent,
  EditorialLocale,
} from "@/modules/editorial/contracts";
import {
  editorialSlug,
  publishedEntries,
  readyImages,
} from "@/modules/editorial/queries";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { EditorialImage } from "./editorial-image";
import { ResponsiveImage } from "./responsive-image";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { storefrontPath } from "@/lib/storefront-path";
import { supportsLookFitting } from "@/modules/editorial/fitting";

export async function MagazineArticle({
  body,
  market,
  locale,
  slug,
  visibleFrom,
  preview,
}: {
  body: ArticleContent;
  market: Market;
  locale: EditorialLocale;
  slug: string;
  visibleFrom?: Date | null;
  preview?: boolean;
}) {
  const lookIds = body.blocks.flatMap((block) =>
    block.type === "LOOK" ? [block.id] : [],
  );
  const ids = body.blocks.flatMap((block) =>
    block.type === "PRODUCT" ? [block.id] : [],
  );
  const [t, entries, products] = await Promise.all([
    getTranslations({ locale, namespace: "editorial" }),
    lookIds.length ? publishedEntries("LOOK", market.id) : [],
    ids.length
      ? db.product.findMany({
          where: {
            id: { in: ids },
            status: "ACTIVE",
            deletedAt: null,
            coinPackCoins: null,
            marketIds: { has: market.id },
            category: { deletedAt: null },
          },
          select: { id: true, titleI18n: true, slugI18n: true },
        })
      : [],
  ]);
  const looks = entries.flatMap((entry) =>
    lookIds.includes(entry.id) && entry.body.kind === "LOOK"
      ? [{ ...entry, body: entry.body }]
      : [],
  );
  const [commerce, images, fitting] = await Promise.all([
    resolveLookCommerce(
      looks.map((look) => look.body),
      market,
      locale,
    ),
    readyImages([
      body.mediaId,
      body.mobileMediaId ?? body.mediaId,
      ...body.blocks.flatMap((b) => (b.type === "IMAGE" ? [b.mediaId] : [])),
    ]),
    preview
      ? []
      : Promise.all(looks.map(({ body }) => supportsLookFitting(body))),
  ]);
  const media = (id?: string) => images.find((image) => image.id === id);
  return (
    <article className="editorial-article">
      <div className="article-lead">
        <header className="editorial-heading article-heading">
          {!preview && (
            <Link href={seoPath(locale, market.code, "magazine")}>
              {t("magazine")}
            </Link>
          )}
          <p className="editorial-kicker">{t(`facet.${body.category}`)}</p>
          {preview && <span className="editorial-draft">{t("draft")}</span>}
          <h1>{body.title[locale]}</h1>
          <p>{body.summary[locale]}</p>
          <div className="article-byline">
            <span>
              {t("author")} <bdi>{body.author}</bdi>
            </span>
            {visibleFrom && (
              <span>
                <time dateTime={visibleFrom.toISOString()}>
                  {new Intl.DateTimeFormat(
                    locale === "fa" ? "fa-IR-u-ca-persian" : locale,
                    {
                      dateStyle: "long",
                      timeZone: "Europe/Istanbul",
                    },
                  ).format(visibleFrom)}
                </time>
              </span>
            )}
          </div>
        </header>
        <EditorialImage
          desktop={media(body.mediaId)}
          mobile={media(body.mobileMediaId)}
          locale={locale}
          focal={body.focal}
          priority
        />
      </div>
      <div className="editorial-story">
        {body.blocks.map((block, index) => {
          switch (block.type) {
            case "HEADING":
              return <h2 key={index}>{block.text[locale]}</h2>;
            case "PARAGRAPH":
              return <p key={index}>{block.text[locale]}</p>;
            case "QUOTE":
              return <blockquote key={index}>{block.text[locale]}</blockquote>;
            case "IMAGE":
              return (
                <figure key={index}>
                  <EditorialImage
                    desktop={media(block.mediaId)}
                    locale={locale}
                  />
                  <figcaption>{block.caption[locale]}</figcaption>
                </figure>
              );
            case "PRODUCT": {
              const product = products.find((p) => p.id === block.id);
              return (
                product && (
                  <p key={index}>
                    <Link
                      href={seoPath(
                        locale,
                        market.code,
                        "p",
                        catalogText(product.slugI18n, locale),
                      )}
                    >
                      {catalogText(product.titleI18n, locale)}
                    </Link>
                  </p>
                )
              );
            }
            case "LOOK": {
              const i = looks.findIndex((look) => look.id === block.id);
              if (i < 0) return null;
              const look = looks[i];
              const quote = commerce[i];
              const lookHref = seoPath(
                locale,
                market.code,
                "looks",
                editorialSlug(look, locale),
              );
              return (
                <section
                  className="article-shop"
                  key={index}
                  aria-label={t("shopPieces")}
                >
                  <div className="article-shop-heading">
                    <div>
                      <h2>{t("shopPieces")}</h2>
                      <p>{look.body.title[locale]}</p>
                    </div>
                    {quote.amount !== null &&
                      quote.available === quote.pieces.length && (
                        <strong>
                          {t("fromPrice", {
                            amount: formatStorefrontAmount(
                              quote.amount,
                              market.currency,
                              locale,
                            ),
                          })}
                        </strong>
                      )}
                  </div>
                  <ul className="article-skus">
                    {quote.pieces.map((piece) => {
                      const variant = piece.variants.find(
                        ({ id }) => id === piece.variantId,
                      );
                      const visual = look.visual?.pieces.find(
                        ({ variantId }) => variantId === piece.variantId,
                      );
                      if (!variant || !piece.href || !visual) return null;
                      const productLink =
                        piece.href +
                        "?" +
                        new URLSearchParams({ color: variant.colorId });
                      return (
                        <li key={visual.sku} data-sku={visual.sku}>
                          {visual.image && (
                            <ResponsiveImage
                              media={visual.image}
                              locale={locale}
                              sizes="64px"
                              imgClassName="h-full w-full object-contain"
                            />
                          )}
                          <div>
                            <Link href={productLink}>{piece.title}</Link>
                            <p>
                              {variant.color} · <bdi>{variant.size}</bdi>
                            </p>
                            <small>
                              {t(
                                variant.available > 0 && variant.amount !== null
                                  ? "inStock"
                                  : "unavailable",
                              )}
                            </small>
                          </div>
                          <div className="article-piece-price">
                            {variant.amount !== null && (
                              <strong>
                                {formatStorefrontAmount(
                                  variant.amount,
                                  market.currency,
                                  locale,
                                )}
                              </strong>
                            )}
                            <Link href={productLink}>{t("chooseSize")}</Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {!preview && (
                    <div className="look-actions">
                      {fitting[i] && (
                        <Link
                          className="button look-primary"
                          href={storefrontPath(
                            locale,
                            market.code,
                            "fitting-room",
                            { look: look.id, story: slug },
                          )}
                        >
                          {t("tryLook")}
                        </Link>
                      )}
                      <Link
                        href={
                          lookHref + "?" + new URLSearchParams({ story: slug })
                        }
                      >
                        {t("viewLook")}
                      </Link>
                    </div>
                  )}
                </section>
              );
            }
          }
        })}
      </div>
    </article>
  );
}
