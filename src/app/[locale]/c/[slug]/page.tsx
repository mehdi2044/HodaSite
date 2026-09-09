import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CatalogFilter } from "@/components/storefront/catalog-filter";
import { ProductCard } from "@/components/storefront/product-card";
import { getRequestContext } from "@/lib/request-context";
import {
  catalogBaseAmount,
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
  const category = await findCategoryBySlug(safe, slug);
  if (!category) return {};
  const seo = category.seoI18n as { title?: unknown; description?: unknown };
  const filters = await searchParams;
  const active = Object.entries(filters).filter(
    ([key, value]) => key !== "page" && value,
  ).length;
  return {
    title:
      catalogText(seo.title, safe) || catalogText(category.titleI18n, safe),
    description:
      catalogText(seo.description, safe) ||
      catalogText(category.descriptionI18n, safe),
    robots: active > 1 ? { index: false, follow: true } : undefined,
    alternates: {
      languages: Object.fromEntries(
        (["fa", "tr", "en"] as const).map((item) => [
          item,
          `/${item}/c/${encodeURIComponent(catalogText(category.slugI18n, item))}`,
        ]),
      ),
    },
  };
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
  const [minPrice, maxPrice] = await Promise.all([
    one(query.min)
      ? catalogBaseAmount(one(query.min)!, {
          code: market.code,
          markupPercent: market.markupPercent.toString(),
        })
      : undefined,
    one(query.max)
      ? catalogBaseAmount(one(query.max)!, {
          code: market.code,
          markupPercent: market.markupPercent.toString(),
        })
      : undefined,
  ]);
  const result = await listCatalogProducts(market.id, safe, {
    categoryId: category.id,
    brandId: one(query.brand),
    colorId: one(query.color),
    sizeId: one(query.size),
    material: one(query.material),
    minPriceUsd: minPrice?.toString(),
    maxPriceUsd: maxPrice?.toString(),
    available: one(query.available) === "1",
    sort: one(query.sort) as
      "newest" | "price-asc" | "price-desc" | "name" | undefined,
    page: Number(one(query.page) || 1),
  });
  return (
    <main className="shell py-10 md:py-16" dir={safe === "fa" ? "rtl" : "ltr"}>
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
              product={product}
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
            href={`?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === "string")) as Record<string, string>), page: String(result.page + 1) }).toString()}`}
          >
            {t("loadMore")}
          </Link>
        </div>
      )}
    </main>
  );
}
