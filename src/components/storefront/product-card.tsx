import { hasNewArrival } from "@/modules/catalog/merchandising";
import { ModaProductCard, type CardColorView } from "./moda-product-card";
import { getVariantDisplayPrices } from "@/modules/pricing";
import Decimal from "decimal.js";
import { inheritedCategoryPresentation } from "@/modules/catalog/category-presentation";
import { publicCatalogCutout } from "@/modules/catalog/cutouts/resolve";
import { KidsMotionCard } from "./kids-motion-card";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { WishlistHeart } from "@/components/engagement/wishlist";
import { seoPath } from "@/lib/seo-urls";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LinkPending } from "./link-pending";
import { ResponsiveImage, isDemoFashionMedia } from "./responsive-image";
import { catalogText, type CatalogLocale } from "@/modules/catalog";
import { getDisplayPrice } from "@/modules/pricing";

type CardProduct = {
  displayPrice?: Awaited<ReturnType<typeof getDisplayPrice>>;
  id: string;
  categoryId?: string;
  tags?: string[];
  slugI18n: unknown;
  titleI18n: unknown;
  basePriceAmount: { toString(): string };
  compareAtPriceAmount: { toString(): string } | null;
  variants: Array<{
    id: string;
    colorId?: string;
    isActive?: boolean;
    color?: {
      id?: string;
      hex: string;
      nameI18n: unknown;
      deletedAt?: Date | null;
    };
    size?: { value: string; deletedAt?: Date | null };
    stockItems?: { onHand: number; reserved: number }[];
    media?: Array<{ media: Parameters<typeof ResponsiveImage>[0]["media"] }>;
    priceOverrideUsd: { toString(): string } | null;
  }>;
  media: Array<{ media: Parameters<typeof ResponsiveImage>[0]["media"] }>;
};

export async function ProductCard({
  product,
  locale,
  market,
  readOnly = false,
  variantPrices,
}: {
  product: CardProduct;
  readOnly?: boolean;
  variantPrices?: Awaited<ReturnType<typeof getVariantDisplayPrices>>;
  locale: CatalogLocale;
  market: {
    id: string;
    code: string;
    currency: string;
    markupPercent: { toString(): string };
    roundingRule: unknown;
  };
}) {
  const t = await getTranslations("shopping");
  const title = catalogText(product.titleI18n, locale);
  const slug = catalogText(product.slugI18n, locale);
  const variant = product.variants[0] ?? null;
  const price =
    product.displayPrice ?? (await getDisplayPrice(product, variant, market));
  const currency = (
    ["IRT", "TRY", "CAD", "USD"].includes(market.currency)
      ? market.currency
      : "USD"
  ) as "IRT" | "TRY" | "CAD" | "USD";
  const categoryId = product.categoryId;
  const presentation = categoryId
    ? await inheritedCategoryPresentation(categoryId)
    : null;
  const kids = presentation?.kind === "kids";
  const cutout =
    kids && variant ? await publicCatalogCutout(variant.id, market.id) : null;
  const image = cutout?.media ?? product.media[0]?.media;
  const cutoutText = kids ? await getTranslations("cutouts") : null;
  const colors = [
    ...new Map(
      product.variants.flatMap((v) =>
        v.color ? [[v.color.hex, v.color] as const] : [],
      ),
    ).values(),
  ];
  const actualVariants = product.variants.filter(
    (variant) =>
      variant.isActive === true &&
      variant.colorId &&
      variant.color &&
      !variant.color.deletedAt &&
      variant.size &&
      !variant.size.deletedAt &&
      Array.isArray(variant.stockItems),
  );
  if (actualVariants.length) {
    const prices =
      variantPrices ??
      (await getVariantDisplayPrices(
        [{ ...product, variants: actualVariants }],
        market,
      ));
    const views: CardColorView[] = await Promise.all(
      [...new Set(actualVariants.map((variant) => variant.colorId!))].map(
        async (colorId) => {
          const choices = actualVariants.filter(
            (variant) => variant.colorId === colorId,
          );
          const first =
            choices.find((variant) =>
              variant.stockItems!.some(
                (stock) => stock.onHand > stock.reserved,
              ),
            ) ?? choices[0];
          const currentCutout = kids
            ? await publicCatalogCutout(first.id, market.id)
            : null;
          const picture =
            currentCutout?.media ??
            choices.flatMap((variant) => variant.media ?? [])[0]?.media ??
            product.media[0]?.media;
          const availableChoices = choices.filter(
            (variant) =>
              variant.stockItems!.reduce(
                (sum, stock) => sum + stock.onHand - stock.reserved,
                0,
              ) > 0,
          );
          const amounts = (availableChoices.length ? availableChoices : choices)
            .map((variant) => prices.get(variant.id)!.amount)
            .sort((a, b) => new Decimal(a).comparedTo(b));
          const min = formatStorefrontAmount(amounts[0], currency, locale);
          return {
            id: colorId,
            photoFallback: kids && !currentCutout,
            name: catalogText(first.color!.nameI18n, locale),
            hex: first.color!.hex,
            price: new Decimal(amounts[0]).eq(amounts.at(-1)!)
              ? min
              : (await getTranslations("scenes"))("from", { price: min }),
            variants: choices.map((variant) => ({
              id: variant.id,
              size: variant.size!.value,
              available: variant.stockItems!.reduce(
                (sum, stock) => sum + stock.onHand - stock.reserved,
                0,
              ),
              price: formatStorefrontAmount(
                prices.get(variant.id)!.amount,
                currency,
                locale,
              ),
            })),
            image: (
              <div
                className={`shop-card-image ${kids ? "kids-card-image" : ""}`}
              >
                {picture ? (
                  <ResponsiveImage
                    media={
                      kids
                        ? {
                            ...picture,
                            presentation: {
                              fit: "contain",
                              focalX: 0.5,
                              focalY: 0.5,
                            },
                          }
                        : picture
                    }
                    role="catalog"
                    locale={locale}
                    sizes="(max-width:640px) 50vw,25vw"
                    className="block h-full w-full"
                    imgClassName={`h-full w-full ${kids ? "object-contain" : "object-cover"}`}
                  />
                ) : (
                  <div className="shop-image-empty">{t("noImage")}</div>
                )}
                {!kids &&
                  product.media[1]?.media &&
                  product.media[1].media.url !== picture?.url && (
                    <div className="shop-card-alternate" aria-hidden="true">
                      <ResponsiveImage
                        media={product.media[1].media}
                        role="catalog"
                        locale={locale}
                        sizes="(max-width:640px) 50vw,25vw"
                        className="block h-full w-full"
                        imgClassName="h-full w-full object-cover"
                      />
                    </div>
                  )}
                {hasNewArrival(product.tags) && (
                  <span className="moda-new-badge">
                    {(await getTranslations("catalog"))("newBadge")}
                  </span>
                )}
                {isDemoFashionMedia(picture) && (
                  <span className="shop-demo-badge">{t("demoImage")}</span>
                )}
              </div>
            ),
          };
        },
      ),
    );
    const interactive = (
      <ModaProductCard
        href={seoPath(locale, market.code, "p", slug)}
        title={title}
        locale={locale}
        colors={views}
        kids={kids}
        readOnly={readOnly}
        wishlist={!readOnly && <WishlistHeart productId={product.id} />}
        note={
          kids && views.some((view) => view.photoFallback) ? (
            <p>{cutoutText!("cardFallback")}</p>
          ) : undefined
        }
      />
    );
    return kids ? (
      <KidsMotionCard tone={presentation!.tone}>{interactive}</KidsMotionCard>
    ) : (
      interactive
    );
  }
  const card = (
    <article className="shop-product-card group">
      <Link
        href={seoPath(locale, market.code, "p", slug)}
        className="shop-product-link block"
      >
        <div
          className={`shop-card-image aspect-[3/4] overflow-hidden bg-black/5 ${kids ? "kids-card-image" : ""}`}
        >
          <div
            className={
              kids ? "kids-turntable-media h-full w-full" : "h-full w-full"
            }
          >
            {image ? (
              <ResponsiveImage
                media={
                  kids
                    ? {
                        ...image,
                        presentation: {
                          fit: "contain",
                          focalX: 0.5,
                          focalY: 0.5,
                        },
                      }
                    : image
                }
                role="catalog"
                locale={locale}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="h-full w-full"
                imgClassName={`h-full w-full ${kids ? "object-contain" : "object-cover"}`}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">
                {t("noImage")}
              </div>
            )}
            {!kids &&
              product.media[1]?.media &&
              product.media[1].media.url !== image?.url && (
                <div className="shop-card-alternate" aria-hidden="true">
                  <ResponsiveImage
                    media={product.media[1].media}
                    role="catalog"
                    locale={locale}
                    sizes="(max-width:640px) 50vw, 25vw"
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover"
                  />
                </div>
              )}
          </div>
          {isDemoFashionMedia(image) && (
            <span className="shop-demo-badge">{t("demoImage")}</span>
          )}
        </div>
        <div className="p-4 shop-card-copy">
          <div className="shop-card-colors" aria-hidden="true">
            {colors.slice(0, 5).map((color) => (
              <span key={color.hex} style={{ background: color.hex }} />
            ))}
          </div>
          <h3 className="font-medium">{title}</h3>
          {kids && !cutout && (
            <p className="shop-cutout-note">{cutoutText!("cardFallback")}</p>
          )}
          <p className="shop-card-price mt-2 text-sm font-semibold" dir="ltr">
            {formatStorefrontAmount(price.amount, currency, locale)}
          </p>
        </div>
        <LinkPending />
      </Link>
      <div className="shop-card-wishlist">
        {!readOnly && <WishlistHeart productId={product.id} />}
      </div>
    </article>
  );
  return kids ? (
    <KidsMotionCard tone={presentation!.tone}>{card}</KidsMotionCard>
  ) : (
    card
  );
}
