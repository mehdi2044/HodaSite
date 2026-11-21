import Link from "next/link";
import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import { catalogText } from "@/modules/catalog";
import { publicCatalogCutout } from "@/modules/catalog/cutouts/resolve";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { localizedValue } from "@/modules/content/homepage";
import type { Moda4Block } from "@/modules/content/moda4-contracts";
import { moda4Products } from "@/modules/content/moda4-products";
import { resolveContentTarget } from "@/modules/content/moda4-targets";
import { getDisplayPrices } from "@/modules/pricing";
import { ModaKidsRing } from "./moda-kids-ring";
import { isDemoFashionMedia, ResponsiveImage } from "./responsive-image";

const cloud =
  "M18 65C2 61 4 43 18 39C16 23 31 13 45 19C51 2 80 1 91 19C105 11 122 18 126 31C148 26 168 36 165 50C187 48 199 64 185 71C163 80 128 72 101 75C73 78 36 77 18 65Z";
const star = "M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6Z";
const podiumTones = [
  "kidsLilac",
  "kidsPeach",
  "kidsMint",
  "kidsSky",
  "kidsPink",
  "kidsButter",
] as const;

type Market = Parameters<typeof getDisplayPrices>[1];
type Locale = "fa" | "tr" | "en";

export async function ModaKidsWorld({
  block,
  market,
  locale,
}: {
  block: Extract<Moda4Block, { type: "KidsWorld" }>;
  market: Market;
  locale: Locale;
}) {
  const text = (value: Parameters<typeof localizedValue>[0]) =>
    localizedValue(value, locale);
  const t = await getTranslations("modaHomepage");
  const [products, shopHref, fittingHref] = await Promise.all([
    moda4Products(market.id, locale, block.source),
    resolveContentTarget(block.target, market.id, locale),
    resolveContentTarget(
      block.secondaryTarget ?? { kind: "fitting" },
      market.id,
      locale,
    ),
  ]);
  const selections = products.flatMap((product) => {
    const slug = (product.slugI18n as Record<string, unknown> | null)?.[locale];
    const variant = product.variants.find((item) => item.isActive);
    return typeof slug === "string" && slug && variant
      ? [{ product, slug, variant }]
      : [];
  });
  const prices = await getDisplayPrices(
    selections.map(({ product, variant }) => ({
      ...product,
      variants: [variant],
    })),
    market,
  );
  const items = await Promise.all(
    selections.map(async ({ product, slug, variant }, index) => {
      const cutout = await publicCatalogCutout(variant.id, market.id);
      const image = cutout?.media ?? product.media[0]?.media;
      const title = catalogText(product.titleI18n, locale);
      const price = prices.get(product.id);
      const fit =
        cutout?.slot === "ONE_PIECE"
          ? "long"
          : cutout?.slot === "BOTTOM"
            ? "bottom"
            : cutout?.slot === "ACCESSORY" || cutout?.slot === "SHOES"
              ? "small"
              : !cutout &&
                  image?.width &&
                  image.height &&
                  image.width / image.height < 0.73
                ? "long"
                : "regular";
      const href =
        seoPath(locale, market.code, "p", slug) +
        "?" +
        new URLSearchParams({ color: variant.colorId });
      return {
        id: product.id,
        content: (
          <Link
            className="moda-kids-piece"
            href={href}
            prefetch={false}
            data-kids-fit={fit}
            style={
              {
                "--kids-podium": `var(--${podiumTones[index % podiumTones.length]})`,
              } as CSSProperties
            }
          >
            <span className="moda-kids-visual">
              {image && (
                <ResponsiveImage
                  media={{ ...image, altI18n: {}, blurDataUrl: null }}
                  locale={locale}
                  sizes="(max-width: 760px) 145px, 235px"
                  imgClassName="moda-kids-garment"
                />
              )}
              {image && (!cutout || isDemoFashionMedia(image)) && (
                <span className="moda-kids-image-note">
                  {t(
                    isDemoFashionMedia(image)
                      ? "kidsDemoImage"
                      : "cutoutFallback",
                  )}
                </span>
              )}
            </span>
            <span className="moda-kids-base" aria-hidden="true" />
            <span className="moda-kids-label">
              <span>{title}</span>
              <bdi>
                {price
                  ? formatStorefrontAmount(
                      price.amount,
                      market.currency,
                      locale,
                    )
                  : t("kidsPriceUnavailable")}
              </bdi>
            </span>
          </Link>
        ),
      };
    }),
  );
  const savedTitle = text(block.title).trim();
  // Preserve merchant-authored titles; map only the old synthetic seed title.
  const legacy = savedTitle === "Little worlds.";
  const title = legacy ? t("kidsTitle") : savedTitle;
  const separator = title.lastIndexOf(" ");
  const titleStart = separator < 0 ? title : title.slice(0, separator);
  const titleEnd = separator < 0 ? "" : title.slice(separator + 1);
  const english = title === "Little Wanderers";

  return (
    <section
      data-moda4="kids-world"
      className="moda-kids-world"
      style={{ "--kids-world-tone": `var(--${block.tone})` } as CSSProperties}
    >
      <div className="moda-kids-decor" aria-hidden="true">
        <svg className="moda-kids-sun" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="34"
            fill="var(--kidsButter)"
            opacity=".5"
          />
          <circle
            cx="50"
            cy="50"
            r="25"
            fill="var(--kidsButter)"
            opacity=".7"
          />
        </svg>
        <svg className="moda-kids-moon" viewBox="0 0 100 100">
          <path
            d="M70 13C31 6 8 53 35 80C57 102 91 83 93 60C70 76 44 60 45 39C45 25 55 17 70 13Z"
            fill="var(--kidsLilac)"
            opacity=".8"
          />
        </svg>
        <svg className="moda-kids-cloud" viewBox="0 0 200 80">
          <path
            fill="var(--kidsSky)"
            opacity=".3"
            d={cloud}
            transform="translate(3 6) scale(.96)"
          />
          <path fill="var(--surface)" opacity=".85" d={cloud} />
        </svg>
        <svg className="moda-kids-cloud" viewBox="0 0 200 80">
          <path
            fill="var(--kidsSky)"
            opacity=".3"
            d={cloud}
            transform="translate(3 6) scale(.96)"
          />
          <path fill="var(--surface)" opacity=".85" d={cloud} />
        </svg>
        <svg className="moda-kids-star" viewBox="0 0 24 24">
          <path fill="var(--kidsPink)" d={star} />
        </svg>
        <svg className="moda-kids-star" viewBox="0 0 24 24">
          <path fill="var(--kidsMint)" d={star} />
        </svg>
      </div>
      <div className="moda-kids-wrap">
        <div className="moda-kids-copy">
          <p className="moda-kids-eyebrow">
            {(block.eyebrow && text(block.eyebrow)) || t("kidsEyebrow")}
          </p>
          <h2
            data-moda4-kids-display=""
            dir={english ? "ltr" : "auto"}
            lang={english ? "en" : undefined}
          >
            {titleStart}
            {titleEnd && (
              <>
                {" "}
                <span>{titleEnd}</span>
              </>
            )}
          </h2>
          <p className="moda-kids-subtitle">
            {(block.subtitle && text(block.subtitle)) || t("kidsSubtitle")}
          </p>
          <p className="moda-kids-body">
            {legacy && text(block.body) === t("kidsLegacyBody")
              ? t("kidsBody")
              : text(block.body)}
          </p>
          <div className="moda-kids-cta">
            {shopHref && (
              <Link
                className="button moda-kids-shop"
                href={shopHref}
                data-moda4-cta=""
              >
                {legacy && text(block.ctaLabel) === t("kidsLegacyCta")
                  ? t("kidsShop")
                  : text(block.ctaLabel)}
              </Link>
            )}
            {fittingHref && (
              <Link
                className="button moda-kids-fitting"
                href={fittingHref}
                data-moda4-cta=""
              >
                {(block.secondaryLabel && text(block.secondaryLabel)) ||
                  t("kidsFitting")}
              </Link>
            )}
          </div>
        </div>
        {items.length ? (
          <ModaKidsRing items={items} />
        ) : (
          <p>{t("noProducts")}</p>
        )}
      </div>
    </section>
  );
}
