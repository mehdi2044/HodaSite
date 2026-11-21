import Link from "next/link";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { getTranslations } from "next-intl/server";
import { getMarketByCode } from "@/modules/settings";
import { publishedEntries, editorialSlug } from "@/modules/editorial/queries";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { supportsLookFitting } from "@/modules/editorial/fitting";
import { addCuratedLookAction } from "@/app/[locale]/looks/actions";
import { seoPath } from "@/lib/seo-urls";
import { storefrontPath } from "@/lib/storefront-path";
import { localizedValue, type HomepageBlock } from "@/modules/content/homepage";
import { CuratedPurchase } from "./curated-purchase";
import { HomeLookPicker } from "./home-look-picker";
import { LookArtwork } from "./look-visual";
import {
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";

export async function HomeCuratedShop({
  block,
  locale,
  marketCode,
  preview,
  excludedIds = [],
}: {
  block: Extract<HomepageBlock, { type: "ShopLook" }>;
  locale: "fa" | "tr" | "en";
  marketCode: string;
  preview: boolean;
  excludedIds?: string[];
}) {
  const market = await getMarketByCode(marketCode);
  if (!market) return null;
  const t = await getTranslations({ locale, namespace: "editorial" });
  const shopping = await getTranslations({ locale, namespace: "shopping" });
  const published = (await publishedEntries("LOOK", market.id)).flatMap(
    (entry) =>
      entry.body.kind === "LOOK" && entry.visual
        ? [{ ...entry, body: entry.body, visual: entry.visual }]
        : [],
  );
  const looks = (block.curatedLookIds ?? []).flatMap((id) => {
    const entry = published.find((look) => look.id === id);
    return entry && !excludedIds.includes(id) ? [entry] : [];
  });
  const [commerce, fitting] = await Promise.all([
    resolveLookCommerce(
      looks.map((look) => look.body),
      market,
      locale,
    ),
    Promise.all(looks.map((look) => supportsLookFitting(look.body))),
  ]);
  return (
    <section className="home-curated-shop" data-moda4="shop-the-look">
      <header className="home-experience-heading">
        <div>
          <h2>{localizedValue(block.title, locale)}</h2>
          <p>{localizedValue(block.body, locale)}</p>
        </div>
        <Link href={seoPath(locale, market.code, "looks")}>
          {t("gallery")} ↗
        </Link>
      </header>
      {looks.length ? (
        <HomeLookPicker
          title={localizedValue(block.title, locale)}
          labels={looks.map((look) => look.body.title[locale])}
          panels={looks.map((look, index) => {
            const images: Record<string, ResponsiveImageMedia> = {};
            const pieces = commerce[index].pieces.map((piece) => {
              const reference = piece.variants.find(
                (variant) => variant.id === piece.variantId,
              );
              const image = look.visual.pieces.find(
                (image) => image.variantId === piece.variantId,
              )?.image;
              if (image && reference) {
                const { originalName, url, variants, width, height, altI18n } =
                  image;
                images[`${piece.productId}:${reference.colorId}`] = {
                  originalName,
                  url,
                  variants,
                  width,
                  height,
                  altI18n,
                  blurDataUrl: null,
                };
              }
              return {
                ...piece,
                variants: reference
                  ? piece.variants.filter(
                      (variant) => variant.colorId === reference.colorId,
                    )
                  : [],
              };
            });
            return (
              <article
                className="home-look-studio"
                data-look-id={look.id}
                key={look.id}
              >
                <div className="home-look-model">
                  <Link
                    href={seoPath(
                      locale,
                      market.code,
                      "looks",
                      editorialSlug(look, locale),
                    )}
                    aria-label={look.body.title[locale]}
                  >
                    <LookArtwork
                      body={look.body}
                      visual={look.visual}
                      locale={locale}
                      label={t("composition")}
                      frame="portrait"
                    />
                  </Link>
                  <div className="home-look-caption">
                    <p>
                      {t(`facet.${look.body.audience}`)} ·{" "}
                      {t("pieceCount", { count: look.body.items.length })}
                    </p>
                    <h3>{look.body.title[locale]}</h3>
                    <p>
                      {commerce[index].amount !== null &&
                      commerce[index].available === look.body.items.length
                        ? t("fromPrice", {
                            amount: formatStorefrontAmount(
                              commerce[index].amount!,
                              market.currency,
                              locale,
                            ),
                          })
                        : t("stockCount", { count: commerce[index].available })}
                    </p>
                    {isDemoFashionMedia(
                      look.visual.mobile ?? look.visual.desktop,
                    ) && <small>{shopping("demoImage")}</small>}
                  </div>
                </div>
                <CuratedPurchase
                  key={`${look.revision.id}:${market.id}`}
                  pieces={pieces}
                  locale={locale}
                  currency={market.currency}
                  compact
                  idPrefix={`home-${look.id}`}
                  imageByColor={images}
                  action={
                    preview
                      ? undefined
                      : addCuratedLookAction.bind(
                          null,
                          locale,
                          look.id,
                          look.revision.id,
                        )
                  }
                  fittingHref={
                    !preview && fitting[index]
                      ? storefrontPath(locale, market.code, "fitting-room", {
                          look: look.id,
                        })
                      : undefined
                  }
                />
              </article>
            );
          })}
        />
      ) : (
        <p className="home-editorial-empty">{t("empty")}</p>
      )}
    </section>
  );
}
