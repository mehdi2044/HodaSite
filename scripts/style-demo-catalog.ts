import type { PrismaClient } from "@prisma/client";
import { styleProducts } from "../prisma/style-products";

type Category = { id: string; parentId: string | null; deletedAt: Date | null };
type Product = {
  id: string;
  categoryId: string;
  marketIds: string[];
  status: string;
  deletedAt: Date | null;
};

/** A global demo rewrite needs all twenty products in their live family in every active market. */
export function isCompleteStyleCatalog(
  products: Product[],
  categories: Category[],
  marketIds: string[],
) {
  if (!marketIds.length) return false;
  const categoryById = new Map(categories.map((row) => [row.id, row]));
  // Department families must be disjoint. Reparenting a root under another
  // department would let that shelf pick products from both families.
  const roots = new Set(
    styleProducts.map(([key]) => `seed-category-${key.split("-")[0]}`),
  );
  for (const id of roots) {
    const root = categoryById.get(id);
    if (!root || root.deletedAt || root.parentId !== null) return false;
  }
  const productById = new Map(products.map((row) => [row.id, row]));
  return styleProducts.every(([key]) => {
    const product = productById.get(`seed-style-v2-${key}`);
    if (
      !product ||
      product.deletedAt ||
      product.status !== "ACTIVE" ||
      marketIds.some((id) => !product.marketIds.includes(id))
    )
      return false;
    const rootId = `seed-category-${key.split("-")[0]}`;
    let categoryId: string | null = product.categoryId;
    const visited = new Set<string>();
    while (categoryId && !visited.has(categoryId)) {
      visited.add(categoryId);
      const category = categoryById.get(categoryId);
      if (!category || category.deletedAt) return false;
      if (category.id === rootId) return true;
      categoryId = category.parentId;
    }
    return false;
  });
}

export async function hasCompleteStyleCatalog(
  db: Pick<PrismaClient, "product" | "category" | "market">,
) {
  const [products, categories, markets] = await Promise.all([
    db.product.findMany({
      where: {
        id: { in: styleProducts.map(([key]) => `seed-style-v2-${key}`) },
      },
      select: {
        id: true,
        categoryId: true,
        marketIds: true,
        status: true,
        deletedAt: true,
      },
    }),
    db.category.findMany({
      select: { id: true, parentId: true, deletedAt: true },
    }),
    db.market.findMany({ where: { isActive: true }, select: { id: true } }),
  ]);
  return isCompleteStyleCatalog(
    products,
    categories,
    markets.map(({ id }) => id),
  );
}
