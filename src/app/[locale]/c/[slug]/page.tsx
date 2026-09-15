import { getDisplayPrices } from "@/modules/pricing";
import { publicMetadata } from "@/modules/seo";
import { filteredListing, singleFacetQuery } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CatalogFilter } from "@/components/storefront/catalog-filter";
import { ProductCard } from "@/components/storefront/product-card";
import { getRequestContext } from "@/lib/request-context";
import {
  catalogFacets,
  catalogText,
  findCategoryBySlug,
  listCatalogProducts,
  type CatalogLocale,
} from "@/modules/catalog";

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Query>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const safe = locale as CatalogLocale;
  const [{ market }, category, filters] = await Promise.all([
    getRequestContext(locale),
    findCategoryBySlug(safe, slug),
    searchParams,
  ]);
  if (!category) return { robots: { index: false, follow: false } };
  const seo = (category.seoI18n ?? {}) as {
    title?: unknown;
    description?: unknown;
  };
  const page = Number(one(filters.page) || 1);
  return publicMetadata({
    locale: safe,
    marketId: market.id,
    kind: "c",
    slugs: category.slugI18n,
    page: Number.isSafeInteger(page) && page > 1 && page <= 100000 ? page : 1,
    facetQuery: singleFacetQuery(filters),
    noindex: filteredListing(filters) || filters.preview !== undefined,
    title:
      catalogText(seo.title, safe) || catalogText(category.titleI18n, safe),
    description:
      catalogText(seo.description, safe) ||
      catalogText(category.descriptionI18n, safe),
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);
  const safe = locale as CatalogLocale;
  const [{ market }, category, facets, t] = await Promise.all([
    getRequestContext(locale),
    findCategoryBySlug(safe, slug),
    catalogFacets(),
    getTranslations("catalog"),
  ]);
  if (!category) notFound();
  const result = await listCatalogProducts(market.id, safe, {
    categoryId: category.id,
    brandId: one(query.brand),
    colorId: one(query.color),
    sizeId: one(query.size),
    material: one(query.material),
    minPrice: one(query.min),
    maxPrice: one(query.max),
    available: one(query.available) === "1",
    sort: one(query.sort) as
      "newest" | "price-asc" | "price-desc" | "name" | undefined,
    page: Number(one(query.page) || 1),
    after: one(query.after),
  });
  const prices = await getDisplayPrices(result.items, market);
  return (
    <main
      className="shell shop-page py-10 md:py-16"
      dir={safe === "fa" ? "rtl" : "ltr"}
    >
      <header className="mb-8">
        <h1 className="text-4xl font-semibold">
          {catalogText(category.titleI18n, safe)}
        </h1>
        <p className="mt-3 max-w-3xl text-muted">
          {catalogText(category.descriptionI18n, safe)}
        </p>
      </header>
      <CatalogFilter
        labels={{
          filters: t("filters"),
          brand: t("brand"),
          color: t("color"),
          size: t("size"),
          material: t("material"),
          minPrice: t("minPrice"),
          maxPrice: t("maxPrice"),
          available: t("available"),
          sort: t("sort"),
          apply: t("apply"),
          all: t("all"),
        }}
        options={{
          brands: facets.brands.map((x) => ({
            id: x.id,
            label: catalogText(x.nameI18n, safe),
          })),
          colors: facets.colors.map((x) => ({
            id: x.id,
            label: catalogText(x.nameI18n, safe),
          })),
          sizes: facets.sizes.map((x) => ({ id: x.id, label: x.value })),
          materials: facets.materials,
        }}
      />
      <p className="my-5 text-sm text-muted">
        {t("results", { count: result.total })}
      </p>
      {result.items.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {result.items.map((product) => (
            <ProductCard
              key={product.id}
              product={{ ...product, displayPrice: prices.get(product.id) }}
              locale={safe}
              market={market}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-52 place-items-center rounded-token bg-surface text-muted">
          {t("empty")}
        </div>
      )}
      {result.pages > result.page && (
        <div className="mt-10 text-center">
          <Link
            className="button"
            href={`?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === "string")) as Record<string, string>), page: String(result.page + 1), ...(result.nextCursor ? { after: result.nextCursor } : {}) }).toString()}`}
          >
            {t("loadMore")}
          </Link>
        </div>
      )}
    </main>
  );
}
