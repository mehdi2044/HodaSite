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
import { CuratedCard } from "./curated-card";

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
  const [commerce, images] = await Promise.all([
    resolveLookCommerce(
      looks.map((look) => look.body),
      market,
      locale,
    ),
    readyImages([
      body.mediaId,
      body.mobileMediaId ?? body.mediaId,
      ...body.blocks.flatMap((b) => (b.type === "IMAGE" ? [b.mediaId] : [])),
      ...looks.flatMap((look) => [
        look.body.mediaId,
        look.body.mobileMediaId ?? look.body.mediaId,
      ]),
    ]),
  ]);
  const media = (id?: string) => images.find((image) => image.id === id);
  return (
    <article className="editorial-article">
      <header className="editorial-heading">
        {!preview && (
          <Link href={seoPath(locale, market.code, "magazine")}>
            {t("magazine")}
          </Link>
        )}
        <p className="editorial-kicker">{t(`facet.${body.category}`)}</p>
        <h1>{body.title[locale]}</h1>
        <p>{body.summary[locale]}</p>
        <p>
          {body.author}
          {visibleFrom && (
            <>
              {" "}
              ·{" "}
              <time dateTime={visibleFrom.toISOString()}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "long",
                  timeZone: "Europe/Istanbul",
                }).format(visibleFrom)}
              </time>
            </>
          )}
        </p>
      </header>
      <EditorialImage
        desktop={media(body.mediaId)}
        mobile={media(body.mobileMediaId)}
        locale={locale}
        focal={body.focal}
        priority
      />
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
              return i >= 0 ? (
                <div key={index}>
                  <CuratedCard
                    t={t}
                    look={looks[i]}
                    locale={locale}
                    market={market}
                    images={images}
                    commerce={commerce[i]}
                  />
                  {!preview && (
                    <Link
                      href={
                        seoPath(
                          locale,
                          market.code,
                          "looks",
                          editorialSlug(looks[i], locale),
                        ) +
                        "?" +
                        new URLSearchParams({ story: slug })
                      }
                    >
                      {t("tryLook")}
                    </Link>
                  )}
                </div>
              ) : null;
            }
          }
        })}
      </div>
    </article>
  );
}
