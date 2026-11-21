import { homepagePublishedLooks } from "@/modules/editorial/homepage-queries";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import { editorialSlug } from "@/modules/editorial/queries";
import {
  selectHomepageLooks,
  homepageVisualIdentity,
} from "@/modules/editorial/home-selection";
import { LookArtwork } from "./look-visual";
import { ModaCarousel } from "./moda-carousel";
import { currentCatalogCutout } from "@/modules/catalog/cutouts/resolve";

export async function HomeCuratedLookbook({
  ids,
  excludedIds,
  excludedMediaIds = [],
  locale,
  market,
  title,
  seconds,
  anchor,
}: {
  ids: string[];
  excludedIds: string[];
  excludedMediaIds?: string[];
  locale: "fa" | "tr" | "en";
  market: { id: string; code: string };
  title: string;
  seconds: number;
  anchor?: string;
}) {
  const t = await getTranslations({ locale, namespace: "editorial" });
  const published = await homepagePublishedLooks(market.id);
  const candidates = selectHomepageLooks(
    ids,
    published,
    excludedIds,
    excludedMediaIds,
  );
  const references = [
    ...new Map(
      [
        ...candidates,
        ...published.filter((look) => excludedIds.includes(look.id)),
      ].map((look) => [look.id, look]),
    ).values(),
  ];
  const prepared = await Promise.all(
    references.map(async (look) => {
      if (look.visual.mode !== "COMPOSITE") return look;
      const pieces = await Promise.all(
        look.visual.pieces.map(async (piece) => {
          const approved = await currentCatalogCutout(
            piece.variantId,
            market.id,
          );
          const image = approved?.row.media ?? piece.image;
          // Alpha cutouts must not retain photographic blur behind transparent pixels.
          return {
            ...piece,
            image: image ? { ...image, blurDataUrl: null } : undefined,
          };
        }),
      );
      return { ...look, visual: { ...look.visual, pieces } };
    }),
  );
  const looks = selectHomepageLooks(
    candidates.map((look) => look.id),
    prepared,
    excludedIds,
    excludedMediaIds,
  );
  const href = (look: (typeof looks)[number]) =>
    seoPath(locale, market.code, "looks", editorialSlug(look, locale));
  return (
    <section
      id={anchor}
      data-moda4="lookbook"
      className="moda-lookbook home-curated-lookbook"
    >
      {looks.length ? (
        <ModaCarousel
          kind="lookbook"
          title={title}
          seconds={seconds}
          labels={looks.map((look) => look.body.title[locale])}
          art={looks.map((look) => (
            <Link
              className="home-lookbook-art"
              data-look-id={look.id}
              data-look-visual={homepageVisualIdentity(look)}
              data-look-photo={
                look.visual.mobile?.id ?? look.visual.desktop?.id
              }
              href={href(look)}
              key={look.id}
              aria-label={look.body.title[locale]}
            >
              <LookArtwork
                body={look.body}
                visual={look.visual}
                locale={locale}
                label={t("composition")}
                frame="portrait"
              />
              <span className="home-lookbook-caption">
                <strong>{look.body.title[locale]}</strong>
                <span>{t("viewLook")} ↗</span>
              </span>
            </Link>
          ))}
          items={looks.map((look) => (
            <Link key={look.id} href={href(look)}>
              {look.body.title[locale]} ·{" "}
              {t("pieceCount", { count: look.body.items.length })} ↗
            </Link>
          ))}
        />
      ) : (
        <p className="home-editorial-empty">{t("empty")}</p>
      )}
    </section>
  );
}
