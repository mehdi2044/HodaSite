import { z } from "zod";
import { db } from "@/lib/db";
import { seoPath } from "@/lib/seo-urls";
import {
  catalogText,
  catalogProductInclude,
  type CatalogLocale,
} from "@/modules/catalog";
import { getDisplayPrice } from "@/modules/pricing";
import { getHomepage, type HomepageBlock } from "@/modules/content/homepage";
import { CommerceError } from "@/modules/orders/state";
import type { PreparedLookView } from "./types";

export type ShopLookBlock = Extract<HomepageBlock, { type: "ShopLook" }>;
type Market = Parameters<typeof getDisplayPrice>[2];

/** Live market/catalog/stock reads: prepared artwork never grants sellability. */
export async function preparedLooks(
  block: ShopLookBlock,
  market: Market,
  locale: CatalogLocale,
) {
  const [media, products, categories] = await Promise.all([
    db.media.findMany({
      where: {
        id: { in: block.looks.map((look) => look.mediaId) },
        kind: "image",
        status: "READY",
        deletedAt: null,
      },
    }),
    db.product.findMany({
      where: {
        id: {
          in: block.looks.flatMap((look) =>
            look.items.map((item) => item.productId),
          ),
        },
        status: "ACTIVE",
        coinPackCoins: null,
        deletedAt: null,
        marketIds: { has: market.id },
        category: { deletedAt: null },
      },
      include: catalogProductInclude,
    }),
    db.category.findMany({
      where: {
        id: { in: block.looks.map((look) => look.categoryId) },
        deletedAt: null,
      },
      select: { id: true },
    }),
  ]);
  const images = new Map(media.map((image) => [image.id, image]));
  const byId = new Map(products.map((product) => [product.id, product]));
  const priceCache = new Map<string, Promise<string>>();
  const result: PreparedLookView[] = [];
  for (const look of block.looks) {
    const image = images.get(look.mediaId);
    if (
      !categories.some((category) => category.id === look.categoryId) ||
      !image ||
      look.items.some((item) => !byId.has(item.productId))
    )
      continue;
    const items = await Promise.all(
      look.items.map(async (item) => {
        const product = byId.get(item.productId)!;
        const eligible = product.variants.filter(
          (variant) =>
            variant.colorId === item.colorId &&
            !variant.color.deletedAt &&
            !variant.size.deletedAt,
        );
        const color = eligible[0]?.color;
        if (!color) return null;
        const picture = [
          ...eligible.flatMap((variant) => variant.media),
          ...product.media,
        ].find(
          (link) => link.media.status === "READY" && !link.media.deletedAt,
        )?.media;
        return {
          productId: product.id,
          title: catalogText(product.titleI18n, locale),
          href: seoPath(
            locale,
            market.code,
            "p",
            catalogText(product.slugI18n, locale),
          ),
          colorName: catalogText(color.nameI18n, locale),
          colorHex: color.hex,
          media: picture,
          variants: await Promise.all(
            eligible.map(async (variant) => {
              if (!priceCache.has(variant.id))
                priceCache.set(
                  variant.id,
                  getDisplayPrice(product, variant, market).then(
                    (price) => price.amount,
                  ),
                );
              return {
                id: variant.id,
                size: variant.size.value,
                amount: await priceCache.get(variant.id)!,
                available: Math.max(
                  0,
                  variant.stockItems.reduce(
                    (sum, stock) => sum + stock.onHand - stock.reserved,
                    0,
                  ),
                ),
              };
            }),
          ),
        };
      }),
    );
    if (items.some((item) => item === null)) continue;
    result.push({
      id: look.id,
      label: catalogText(look.label, locale),
      categoryId: look.categoryId,
      media: image,
      items: items.filter((item) => item !== null),
    });
  }
  return result;
}

export async function relevantLookBlocks(
  marketId: string,
  filter: { categoryId?: string; productId?: string },
) {
  const home = await getHomepage(marketId);
  return home.blocks.flatMap((block) => {
    if (block.type !== "ShopLook") return [];
    const looks = block.looks.filter(
      (look) =>
        (filter.categoryId && look.categoryId === filter.categoryId) ||
        (filter.productId &&
          look.items.some((item) => item.productId === filter.productId)),
    );
    return looks.length ? [{ ...block, looks }] : [];
  });
}

export const lookSelectionSchema = z
  .array(z.string().trim().min(1).max(100))
  .min(1)
  .max(4)
  .refine((ids) => new Set(ids).size === ids.length);

/** Request IDs/prices/category labels are never trusted from the browser. */
export async function addPreparedLook(
  locale: CatalogLocale,
  marketId: string,
  lookId: string,
  input: unknown,
) {
  const variantIds = lookSelectionSchema.parse(input);
  const home = await getHomepage(marketId);
  const look = home.blocks
    .flatMap((block) => (block.type === "ShopLook" ? block.looks : []))
    .find((item) => item.id === lookId);
  if (!look) throw new CommerceError("VALIDATION");
  const variants = await db.variant.findMany({
    where: {
      id: { in: variantIds },
      isActive: true,
      color: { deletedAt: null },
      size: { deletedAt: null },
      product: {
        status: "ACTIVE",
        coinPackCoins: null,
        deletedAt: null,
        marketIds: { has: marketId },
        category: { deletedAt: null },
      },
    },
    select: { id: true, productId: true, colorId: true },
  });
  if (
    variants.length !== variantIds.length ||
    new Set(variants.map((variant) => variant.productId)).size !==
      variants.length ||
    variants.some(
      (variant) =>
        !look.items.some(
          (item) =>
            item.productId === variant.productId &&
            item.colorId === variant.colorId,
        ),
    )
  )
    throw new CommerceError("VALIDATION");
  const { addCartItems } = await import("@/modules/cart");
  await addCartItems(locale, variantIds);
}

export async function validateLookReferences(
  blocks: HomepageBlock[],
  marketId: string | null,
) {
  for (const block of blocks) {
    if (block.type !== "ShopLook") continue;
    for (const look of block.looks) {
      if (
        !(await db.category.count({
          where: { id: look.categoryId, deletedAt: null },
        }))
      )
        throw new z.ZodError([]);
      const products = await db.product.findMany({
        where: {
          id: { in: look.items.map((item) => item.productId) },
          deletedAt: null,
          status: "ACTIVE",
          coinPackCoins: null,
          category: { deletedAt: null },
          ...(marketId ? { marketIds: { has: marketId } } : {}),
        },
        select: {
          id: true,
          variants: {
            where: {
              isActive: true,
              color: { deletedAt: null },
              size: { deletedAt: null },
            },
            select: { colorId: true },
          },
        },
      });
      if (
        look.items.some(
          (item) =>
            !products.some(
              (product) =>
                product.id === item.productId &&
                product.variants.some(
                  (variant) => variant.colorId === item.colorId,
                ),
            ),
        )
      )
        throw new z.ZodError([]);
    }
  }
}
