import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LinkPending } from "./link-pending";
import { ResponsiveImage } from "./responsive-image";
import {
  catalogText,
  formatCatalogCurrency,
  type CatalogLocale,
} from "@/modules/catalog";
import { getDisplayPrice } from "@/modules/pricing";

type CardProduct = {
  id: string;
  slugI18n: unknown;
  titleI18n: unknown;
  basePriceAmount: { toString(): string };
  compareAtPriceAmount: { toString(): string } | null;
  variants: Array<{
    id: string;
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
  const price = await getDisplayPrice(product, variant, market);
  const currency = (
    ["IRT", "TRY", "CAD", "USD"].includes(market.currency)
      ? market.currency
      : "USD"
  ) as "IRT" | "TRY" | "CAD" | "USD";
  const image = product.media[0]?.media;
  return (
    <article className="shop-product-card group overflow-hidden rounded-token bg-surface shadow-[0_16px_50px_rgba(57,35,11,0.08)]">
      <Link href={`/${locale}/p/${encodeURIComponent(slug)}`} className="block">
        <div className="aspect-[3/4] overflow-hidden bg-black/5">
          {image ? (
            <ResponsiveImage
              media={image}
              locale={locale}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="h-full w-full"
              imgClassName="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">
              {t("noImage")}
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-medium">{title}</h3>
          <p className="mt-2 text-sm font-semibold" dir="ltr">
            {formatCatalogCurrency(price.amount, currency, locale)}
          </p>
        </div>
        <LinkPending />
      </Link>
    </article>
  );
}
