import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { addSceneCartItems } from "@/modules/cart";
import { catalogProductInclude, catalogText } from "@/modules/catalog";
import { CommerceError } from "@/modules/orders";
import {
  getVariantDisplayPrices,
  MissingActiveFxError,
} from "@/modules/pricing";
import { seoPath } from "@/lib/seo-urls";
import { publishedEntry } from "./queries";
import {
  selectedVariants,
  type EditorialLocale,
  type LookContent,
} from "./contracts";

type Market = Parameters<typeof getVariantDisplayPrices>[1] & {
  salesPaused: boolean;
};

export async function resolveLookCommerce(
  looks: LookContent[],
  market: Market,
  locale: EditorialLocale,
) {
  const ids = [
    ...new Set(
      looks.flatMap((look) => look.items.map((item) => item.productId)),
    ),
  ];
  if (!ids.length) return [];
  const products = await db.product.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: "ACTIVE",
      coinPackCoins: null,
      marketIds: { has: market.id },
      category: { deletedAt: null },
    },
    include: catalogProductInclude,
  });
  const active = products.map((product) => ({
    ...product,
    variants: product.variants.filter(
      (v) => !v.size.deletedAt && !v.color.deletedAt,
    ),
  }));
  const byProduct = new Map(active.map((product) => [product.id, product]));
  // Missing FX or market quotes leave purchase unavailable without hiding editorial copy.
  const amounts = await getVariantDisplayPrices(active, market).catch(
    (error: unknown) => {
      if (error instanceof MissingActiveFxError) return null;
      throw error;
    },
  );
  return looks.map((look) => {
    const pieces = look.items.map((item) => {
      const product = byProduct.get(item.productId);
      return {
        ...item,
        title: product ? catalogText(product.titleI18n, locale) : null,
        href: product
          ? seoPath(
              locale,
              market.code,
              "p",
              catalogText(product.slugI18n, locale),
            )
          : null,
        variants:
          product?.variants.map((v) => ({
            id: v.id,
            amount: market.salesPaused
              ? null
              : (amounts?.get(v.id)?.amount ?? null),
            colorId: v.colorId,
            color: catalogText(v.color.nameI18n, locale),
            size: v.size.value,
            available: v.stockItems.reduce(
              (stock, line) => stock + Math.max(0, line.onHand - line.reserved),
              0,
            ),
          })) ?? [],
      };
    });
    const available = pieces.flatMap((piece) => {
      const candidates = piece.variants.filter(
        (v) => v.available > 0 && v.amount !== null,
      );
      return candidates.length
        ? [Decimal.min(...candidates.map((v) => v.amount!))]
        : [];
    });
    return {
      pieces,
      available: available.length,
      amount: available.length
        ? available
            .reduce((sum, amount) => sum.plus(amount), new Decimal(0))
            .toFixed()
        : null,
    };
  });
}
export type LookCommerce = Awaited<
  ReturnType<typeof resolveLookCommerce>
>[number];

export async function addCuratedLook(
  locale: EditorialLocale,
  id: string,
  revisionId: string,
  raw: unknown,
) {
  const ids = selectedVariants.parse(raw);
  await addSceneCartItems(locale, ids, async (tx, marketId) => {
    await tx.$queryRaw`SELECT id FROM "EditorialEntry" WHERE id = ${id} FOR SHARE`;
    const look = await publishedEntry("LOOK", { id }, marketId, tx);
    if (look?.body.kind !== "LOOK" || look.revision.id !== revisionId)
      throw new CommerceError("VALIDATION");
    const items = look.body.items;
    const variants = await tx.variant.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        size: { deletedAt: null },
        color: { deletedAt: null },
        product: {
          status: "ACTIVE",
          deletedAt: null,
          coinPackCoins: null,
          marketIds: { has: marketId },
          category: { deletedAt: null },
        },
      },
      select: { productId: true },
    });
    const products = new Set(variants.map((variant) => variant.productId));
    if (
      products.size !== ids.length ||
      [...products].some(
        (productId) => !items.some((item) => item.productId === productId),
      )
    )
      throw new CommerceError("VALIDATION");
  });
}
