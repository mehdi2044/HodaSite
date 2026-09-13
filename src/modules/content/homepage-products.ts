import { db } from "@/lib/db";
import { listBestsellers, listCatalogProducts } from "@/modules/catalog";
import type { HomepageBlock } from "./homepage";

type Source = Extract<HomepageBlock, { type: "ProductStrip" }>["source"];

export async function homepageSourceExists(source: Source) {
  if (source.mode !== "category" && source.mode !== "collection") return true;
  if (!source.referenceId) return false;
  const where = { id: source.referenceId, deletedAt: null };
  return Boolean(
    source.mode === "category"
      ? await db.category.findFirst({ where, select: { id: true } })
      : await db.collection.findFirst({ where, select: { id: true } }),
  );
}

export async function homepageProducts(
  marketId: string,
  locale: "fa" | "tr" | "en",
  source: Source,
) {
  if (!(await homepageSourceExists(source))) return { items: [] };
  if (source.mode === "bestseller")
    return { items: await listBestsellers(marketId, source.limit) };
  return listCatalogProducts(marketId, locale, {
    limit: source.limit,
    ...(source.mode === "category" ? { categoryId: source.referenceId } : {}),
    ...(source.mode === "collection"
      ? { collectionId: source.referenceId }
      : {}),
  });
}
