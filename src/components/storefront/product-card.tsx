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
  slugI18n: unknown;
  titleI18n: unknown;
  basePriceAmount: { toString(): string };
  compareAtPriceAmount: { toString(): string } | null;
  variants: Array<{
    id: string;
    color?: { hex: string; nameI18n: unknown };
    priceOverrideUsd: { toString(): string } | null;
  }>;
  media: Array<{ media: Parameters<typeof ResponsiveImage>[0]["media"] }>;
};

export async function ProductCard({
  product,
  locale,
  market,
}: {
  product: CardProduct;
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
  const card = (
    <article className="shop-product-card group">
      <Link
        href={seoPath(locale, market.code, "p", slug)}
        className="shop-product-link block"
      >
        <div
          className={`shop-card-image aspect-[4/5] overflow-hidden bg-black/5 ${kids ? "kids-card-image" : ""}`}
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
        <WishlistHeart productId={product.id} />
      </div>
    </article>
  );
  return kids ? (
    <KidsMotionCard tone={presentation!.tone}>{card}</KidsMotionCard>
  ) : (
    card
  );
}
