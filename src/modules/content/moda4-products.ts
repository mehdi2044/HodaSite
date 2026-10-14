import { db } from "@/lib/db";
import {
  catalogProductInclude,
  listBestsellers,
  listCatalogProducts,
} from "@/modules/catalog";
import { modaSourceSchema } from "./moda4-contracts";
import type { z } from "zod";
export async function moda4Products(
  marketId: string,
  locale: "fa" | "tr" | "en",
  raw: z.infer<typeof modaSourceSchema>,
) {
  const source = modaSourceSchema.parse(raw);
  if (source.mode === "manual") {
    const rows = await db.product.findMany({
      where: {
        id: { in: source.productIds },
        status: "ACTIVE",
        deletedAt: null,
        coinPackCoins: null,
        marketIds: { has: marketId },
        category: { deletedAt: null },
        variants: {
          some: {
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
        },
      },
      include: catalogProductInclude,
    });
    return source.productIds.slice(0, source.limit).flatMap((id) => {
      const product = rows.find((row) => row.id === id);
      return product
        ? [
            {
              ...product,
              variants: product.variants.filter(
                (variant) =>
                  !variant.color.deletedAt && !variant.size.deletedAt,
              ),
            },
          ]
        : [];
    });
  }
  if (source.mode === "category" || source.mode === "collection") {
    const where = { id: source.referenceId, deletedAt: null };
    if (
      !(source.mode === "category"
        ? await db.category.count({ where })
        : await db.collection.count({ where }))
    )
      return [];
  }
  const rows =
    source.mode === "bestseller"
      ? await listBestsellers(marketId, source.limit)
      : (
          await listCatalogProducts(marketId, locale, {
            limit: source.limit,
            ...(source.mode === "category"
              ? { categoryId: source.referenceId }
              : {}),
            ...(source.mode === "collection"
              ? { collectionId: source.referenceId }
              : {}),
          })
        ).items;
  return rows
    .map((product) => ({
      ...product,
      variants: product.variants.filter(
        (variant) => !variant.color.deletedAt && !variant.size.deletedAt,
      ),
    }))
    .filter(
      (product) =>
        product.coinPackCoins === null &&
        product.category.deletedAt === null &&
        product.variants.some(
          (variant) =>
            variant.isActive &&
            !variant.color.deletedAt &&
            !variant.size.deletedAt,
        ),
    );
}
