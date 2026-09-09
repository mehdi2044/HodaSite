import Link from "next/link";
import { ResponsiveImage } from "./responsive-image";
import {
  catalogDisplayAmount,
  catalogText,
  formatCatalogCurrency,
  type CatalogLocale,
} from "@/modules/catalog";

type CardProduct = {
  slugI18n: unknown;
  titleI18n: unknown;
  basePriceAmount: { toString(): string };
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
    code: string;
    currency: string;
    markupPercent: { toString(): string };
  };
}) {
  const title = catalogText(product.titleI18n, locale);
  const slug = catalogText(product.slugI18n, locale);
  const amount = await catalogDisplayAmount(
    product.basePriceAmount.toString(),
    { code: market.code, markupPercent: market.markupPercent.toString() },
  );
  const currency = (
    ["IRT", "TRY", "CAD", "USD"].includes(market.currency)
      ? market.currency
      : "USD"
  ) as "IRT" | "TRY" | "CAD" | "USD";
  const image = product.media[0]?.media;
  return (
    <article className="group overflow-hidden rounded-token bg-surface shadow-[0_16px_50px_rgba(57,35,11,0.08)]">
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
              STYLE HUB
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-medium">{title}</h3>
          <p className="mt-2 text-sm font-semibold" dir="ltr">
            {formatCatalogCurrency(amount, currency, locale)}
          </p>
        </div>
      </Link>
    </article>
  );
}
