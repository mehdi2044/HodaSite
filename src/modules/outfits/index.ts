import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { seoPath } from "@/lib/seo-urls";
import {
  catalogText,
  catalogProductInclude,
  type CatalogLocale,
} from "@/modules/catalog";
import { getVariantDisplayPrices } from "@/modules/pricing";
import { getHomepage, type HomepageBlock } from "@/modules/content/homepage";
import { CommerceError } from "@/modules/orders/state";
import type { PreparedLookView } from "./types";

export type ShopLookBlock = Extract<HomepageBlock, { type: "ShopLook" }>;
type Market = Parameters<typeof getVariantDisplayPrices>[1];

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
  const chosenColors = new Map<string, Set<string>>();
  for (const look of block.looks)
    for (const item of look.items) {
      const colors = chosenColors.get(item.productId) ?? new Set<string>();
      colors.add(item.colorId);
      chosenColors.set(item.productId, colors);
    }
  const prices = await getVariantDisplayPrices(
    products.map((product) => ({
      ...product,
      variants: product.variants.filter(
        (variant) =>
          chosenColors.get(product.id)?.has(variant.colorId) &&
          !variant.color.deletedAt &&
          !variant.size.deletedAt,
      ),
    })),
    market,
  );
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
          variants: eligible.map((variant) => {
            return {
              id: variant.id,
              size: variant.size.value,
              amount: prices.get(variant.id)!.amount,
              available: Math.max(
                0,
                variant.stockItems.reduce(
                  (sum, stock) => sum + stock.onHand - stock.reserved,
                  0,
                ),
              ),
            };
          }),
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
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? db;
  if (tx) await lockLookReferences(tx, blocks);
  for (const block of blocks) {
    if (block.type !== "ShopLook") continue;
    for (const look of block.looks) {
      if (
        !(await client.category.count({
          where: { id: look.categoryId, deletedAt: null },
        }))
      )
        throw new z.ZodError([]);
      const products = await client.product.findMany({
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

/** Hold JSON catalog references until the homepage writer commits. */
async function lockLookReferences(
  tx: Prisma.TransactionClient,
  blocks: HomepageBlock[],
) {
  const looks = blocks.flatMap((b) => (b.type === "ShopLook" ? b.looks : []));
  const productIds = [
    ...new Set(looks.flatMap((l) => l.items.map((i) => i.productId))),
  ].sort();
  if (!productIds.length) return;
  // UPDATE also blocks new variant FK inserts while the eligible variants are read.
  const products = await tx.$queryRaw<
    { id: string; categoryId: string }[]
  >(Prisma.sql`
    SELECT id, "categoryId" FROM "Product" WHERE id IN (${Prisma.join(productIds)})
    ORDER BY id FOR UPDATE
  `);
  const categoryIds = [
    ...new Set([
      ...looks.map((l) => l.categoryId),
      ...products.map((p) => p.categoryId),
    ]),
  ].sort();
  if (categoryIds.length)
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM "Category" WHERE id IN (${Prisma.join(categoryIds)}) ORDER BY id FOR SHARE
    `);
  const variants = await tx.$queryRaw<
    { colorId: string; sizeId: string }[]
  >(Prisma.sql`
    SELECT "colorId", "sizeId" FROM "Variant" WHERE "productId" IN (${Prisma.join(productIds)})
    ORDER BY id FOR SHARE
  `);
  const colorIds = [
    ...new Set([
      ...looks.flatMap((l) => l.items.map((i) => i.colorId)),
      ...variants.map((v) => v.colorId),
    ]),
  ].sort();
  const sizeIds = [...new Set(variants.map((v) => v.sizeId))].sort();
  if (colorIds.length)
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM "Color" WHERE id IN (${Prisma.join(colorIds)}) ORDER BY id FOR SHARE
    `);
  if (sizeIds.length)
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM "Size" WHERE id IN (${Prisma.join(sizeIds)}) ORDER BY id FOR SHARE
    `);
}
