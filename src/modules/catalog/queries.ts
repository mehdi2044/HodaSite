import Decimal from "decimal.js";
import { getDisplayPrices } from "@/modules/pricing";
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
  minPrice?: string;
  maxPrice?: string;
  available?: boolean;
  sort?: "newest" | "price-asc" | "price-desc" | "name";
  page?: number;
  after?: string;
  limit?: number;
};

export const catalogProductInclude = {
  brand: true,
  category: true,
  media: { orderBy: { sortOrder: "asc" as const }, include: { media: true } },
  variants: {
    where: { isActive: true },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: {
      color: true,
      size: true,
      stockItems: true,
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
  const page =
    Number.isSafeInteger(filters.page) && filters.page! > 0
      ? Math.min(100000, filters.page!)
      : 1;
  const after =
    filters.after && /^[A-Za-z0-9_-]{1,100}$/.test(filters.after)
      ? filters.after
      : undefined;
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
    if (!matchingIds.length)
      return {
        items: [],
        total: 0,
        page,
        pages: 0,
        nextCursor: null as string | null,
      };
  }

  if (filters.available) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT v."productId" AS id
      FROM "Variant" v
      JOIN "StockItem" s ON s."variantId" = v.id
      WHERE v."isActive" = true AND s."onHand" - s.reserved > 0
    `;
    const availableIds = new Set(rows.map((row) => row.id));
    matchingIds = matchingIds
      ? matchingIds.filter((id) => availableIds.has(id))
      : [...availableIds];
    if (!matchingIds.length)
      return {
        items: [],
        total: 0,
        page,
        pages: 0,
        nextCursor: null as string | null,
      };
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
    ...(filters.colorId || filters.sizeId
      ? {
          variants: {
            some: {
              isActive: true,
              ...(filters.colorId ? { colorId: filters.colorId } : {}),
              ...(filters.sizeId ? { sizeId: filters.sizeId } : {}),
            },
          },
        }
      : {}),
  };
  const usesPrices =
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.sort === "price-asc" ||
    filters.sort === "price-desc";
  if (usesPrices) {
    const market = await db.market.findUniqueOrThrow({
      where: { id: marketId },
    });
    const candidates = await db.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        basePriceAmount: true,
        compareAtPriceAmount: true,
        variants: {
          where: { isActive: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 1,
          select: { id: true, priceOverrideUsd: true },
        },
      },
    });
    const bound = (value: string | undefined) =>
      value !== undefined && /^\d+(\.\d+)?$/.test(value)
        ? new Decimal(value)
        : null;
    const min = bound(filters.minPrice),
      max = bound(filters.maxPrice);
    const priced: Array<{ id: string; amount: Decimal }> = [];
    const effective = await getDisplayPrices(candidates, market);
    for (const product of candidates) {
      const amount = new Decimal(effective.get(product.id)!.amount);
      if ((!min || amount.gte(min)) && (!max || amount.lte(max)))
        priced.push({ id: product.id, amount });
    }
    if (filters.sort === "price-asc" || filters.sort === "price-desc")
      priced.sort(
        (a, b) =>
          (filters.sort === "price-desc"
            ? b.amount.comparedTo(a.amount)
            : a.amount.comparedTo(b.amount)) || a.id.localeCompare(b.id),
      );
    const offset = after
      ? Math.max(0, priced.findIndex((p) => p.id === after) + 1)
      : (page - 1) * take;
    const ids = priced.slice(offset, offset + take).map((item) => item.id);
    const products = ids.length
      ? await db.product.findMany({
          where: { ...where, id: { in: ids } },
          include: catalogProductInclude,
        })
      : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    return {
      items: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
      total: priced.length,
      page,
      pages: Math.ceil(priced.length / take),
      nextCursor: offset + take < priced.length ? (ids.at(-1) ?? null) : null,
    };
  }
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    filters.sort === "name"
      ? [{ titleI18n: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];
  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      include: catalogProductInclude,
      orderBy,
      ...(after
        ? { cursor: { id: after }, skip: 1 }
        : { skip: (page - 1) * take }),
      take,
    }),
    db.product.count({ where }),
  ]);
  void locale;
  return {
    items,
    total,
    page,
    pages: Math.ceil(total / take),
    nextCursor: items.length === take ? items.at(-1)!.id : null,
  };
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
  options: { includeInactive?: boolean } = {},
) {
  const slug = safeDecode(encodedSlug);
  return db.product.findFirst({
    where: {
      deletedAt: null,
      ...(options.includeInactive ? {} : { status: "ACTIVE" as const }),
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
          stockItems: true,
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
      where: { deletedAt: null, status: "ACTIVE", material: { not: null } },
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
