import type { CatalogFilters } from "./queries";
export type ListingQuery = Record<string, string | string[] | undefined>;
export const CATALOG_FACET_KEYS = [
  "brand",
  "color",
  "size",
  "material",
  "min",
  "max",
  "available",
  "sort",
] as const;
export const listingValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
/** Presentation parser only; the existing catalog/pricing layer validates the actual query. */
export function listingFilters(query: ListingQuery): CatalogFilters {
  const one = (key: string) => listingValue(query[key]);
  const rawSort = one("sort");
  const sort = ["newest", "price-asc", "price-desc", "name"].includes(
    rawSort ?? "",
  )
    ? (rawSort as CatalogFilters["sort"])
    : undefined;
  return {
    brandId: one("brand")?.slice(0, 100),
    colorId: one("color")?.slice(0, 100),
    sizeId: one("size")?.slice(0, 100),
    material: one("material")?.slice(0, 200),
    minPrice: one("min")?.slice(0, 60),
    maxPrice: one("max")?.slice(0, 60),
    available: one("available") === "1",
    sort,
    page: Number(one("page") || 1),
    after: one("after")?.slice(0, 1000),
  };
}
export function withoutListingFacet(query: URLSearchParams, key?: string) {
  const next = new URLSearchParams(query);
  for (const name of key ? [key] : CATALOG_FACET_KEYS) next.delete(name);
  next.delete("page");
  next.delete("after");
  return next;
}
