import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeSearchText } from "./search";

export type CatalogLocale = "fa" | "tr" | "en";

export type CatalogFilters = {
  q?: string;
  categoryId?: string;
  collectionId?: string;
  brandId?: string;
  colorId?: string;
  sizeId?: string;
  material?: string;
  minPriceUsd?: string;
  maxPriceUsd?: string;
  available?: boolean;
  sort?: "newest" | "price-asc" | "price-desc" | "name";
  page?: number;
  limit?: number;
};

export const catalogProductInclude = {
  brand: true,
  category: true,
  media: { orderBy: { sortOrder: "asc" as const }, include: { media: true } },
  variants: {
    where: { isActive: true },
    orderBy: { createdAt: "asc" as const },
    include: {
      color: true,
      size: true,
      media: {
        orderBy: { sortOrder: "asc" as const },
        include: { media: true },
      },
    },
  },
  attributes: true,
  collections: true,
} satisfies Prisma.ProductInclude;

export async function listCatalogProducts(
  marketId: string,
  locale: CatalogLocale,
  filters: CatalogFilters = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const take = Math.min(24, Math.max(1, filters.limit ?? 12));
  const query = filters.q ? normalizeSearchText(filters.q) : "";
  let matchingIds: string[] | undefined;
  if (query) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Product"
      WHERE "deletedAt" IS NULL
        AND "status" = 'ACTIVE'::"ProductStatus"
        AND ${marketId} = ANY("marketIds")
        AND ("searchVector" @@ plainto_tsquery('simple', ${query}) OR similarity("searchText", ${query}) >= 0.18)
      ORDER BY ts_rank("searchVector", plainto_tsquery('simple', ${query})) DESC,
               similarity("searchText", ${query}) DESC
      LIMIT 250
    `);
    matchingIds = rows.map((row) => row.id);
    if (!matchingIds.length) return { items: [], total: 0, page, pages: 0 };
  }

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: "ACTIVE",
    marketIds: { has: marketId },
    ...(matchingIds ? { id: { in: matchingIds } } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.collectionId
      ? { collections: { some: { id: filters.collectionId } } }
      : {}),
    ...(filters.brandId ? { brandId: filters.brandId } : {}),
    ...(filters.material ? { material: filters.material } : {}),
    ...(filters.minPriceUsd || filters.maxPriceUsd
      ? {
          basePriceAmount: {
            ...(filters.minPriceUsd ? { gte: filters.minPriceUsd } : {}),
            ...(filters.maxPriceUsd ? { lte: filters.maxPriceUsd } : {}),
          },
        }
      : {}),
    ...(filters.available || filters.colorId || filters.sizeId
      ? {
          variants: {
            some: {
              ...(filters.available ? { isActive: true } : {}),
              ...(filters.colorId ? { colorId: filters.colorId } : {}),
              ...(filters.sizeId ? { sizeId: filters.sizeId } : {}),
            },
          },
        }
      : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    filters.sort === "price-asc"
      ? { basePriceAmount: "asc" }
      : filters.sort === "price-desc"
        ? { basePriceAmount: "desc" }
        : filters.sort === "name"
          ? { titleI18n: "asc" }
          : { createdAt: "desc" };
  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      include: catalogProductInclude,
      orderBy,
      skip: (page - 1) * take,
      take,
    }),
    db.product.count({ where }),
  ]);
  void locale;
  return { items, total, page, pages: Math.ceil(total / take) };
}

export async function findCategoryBySlug(
  locale: CatalogLocale,
  encodedSlug: string,
) {
  const slug = safeDecode(encodedSlug);
  return db.category.findFirst({
    where: { deletedAt: null, slugI18n: { path: [locale], equals: slug } },
  });
}

export async function findProductBySlug(
  marketId: string,
  locale: CatalogLocale,
  encodedSlug: string,
) {
  const slug = safeDecode(encodedSlug);
  return db.product.findFirst({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      marketIds: { has: marketId },
      slugI18n: { path: [locale], equals: slug },
    },
    include: {
      ...catalogProductInclude,
      variants: {
        orderBy: { createdAt: "asc" },
        include: {
          color: true,
          size: true,
          media: { orderBy: { sortOrder: "asc" }, include: { media: true } },
        },
      },
    },
  });
}

export async function catalogFacets() {
  const [brands, colors, sizes, categories, materialRows] = await Promise.all([
    db.brand.findMany({ where: { deletedAt: null }, orderBy: { slug: "asc" } }),
    db.color.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    db.size.findMany({
      where: { deletedAt: null },
      orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }],
    }),
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    db.product.findMany({
      where: { deletedAt: null, material: { not: null } },
      distinct: ["material"],
      select: { material: true },
      orderBy: { material: "asc" },
    }),
  ]);
  return {
    brands,
    colors,
    sizes,
    categories,
    materials: materialRows.flatMap((row) =>
      row.material ? [row.material] : [],
    ),
  };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
