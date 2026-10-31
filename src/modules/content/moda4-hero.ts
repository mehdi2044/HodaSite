import { scenePriceRange } from "./scenes/prices";
import { getTranslations } from "next-intl/server";
/**
 * M4-01 / M4-02 server resolvers. Public data only: no drafts, no stored
 * amounts, no fabricated defaults. Every price comes from the pricing
 * resolver for the current market; anything not resolvable is omitted.
 */
import { db } from "@/lib/db";
import {
  catalogProductInclude,
  catalogText,
  type CatalogLocale,
} from "@/modules/catalog";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { publicCatalogCutout } from "@/modules/catalog/cutouts/resolve";
import { getVariantDisplayPrices } from "@/modules/pricing";
import { seoPath } from "@/lib/seo-urls";

type Market = Parameters<typeof getVariantDisplayPrices>[1];

/** Optional decorative cross-sell beside the hero model. Null hides it. */
export async function resolveHeroFloat(
  ref: { productId: string; colorId: string },
  market: Market & { id: string; code: string },
  locale: CatalogLocale,
) {
  const product = await db.product.findFirst({
    where: {
      id: ref.productId,
      status: "ACTIVE",
      deletedAt: null,
      coinPackCoins: null,
      marketIds: { has: market.id },
      category: { deletedAt: null },
    },
    include: catalogProductInclude,
  });
  if (!product) return null;
  const variants = product.variants.filter(
    (v) =>
      v.isActive &&
      v.colorId === ref.colorId &&
      !v.color.deletedAt &&
      !v.size.deletedAt,
  );
  if (!variants.length) return null;
  const cutout = await publicCatalogCutout(variants[0].id, market.id);
  if (!cutout?.media) return null;
  const prices = await getVariantDisplayPrices(
    [{ ...product, variants }],
    market,
  ).catch(() => null);
  const amounts = variants
    .filter(
      (v) => v.stockItems.reduce((n, s) => n + s.onHand - s.reserved, 0) > 0,
    )
    .map((v) => prices?.get(v.id)?.amount)
    .filter((a): a is string => typeof a === "string");
  if (!amounts.length) return null; // no readable price → no float (never a fake one)
  const range = scenePriceRange(amounts)!;
  const t = await getTranslations({ locale, namespace: "scenes" });
  const minimum = formatStorefrontAmount(range.min, market.currency, locale);
  return {
    media: cutout.media,
    title: catalogText(product.titleI18n, locale),
    price: range.min === range.max ? minimum : t("from", { price: minimum }),
    href:
      seoPath(locale, market.code, "p", catalogText(product.slugI18n, locale)) +
      `?color=${encodeURIComponent(ref.colorId)}`,
  };
}
