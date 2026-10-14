import Link from "next/link";
import { CatalogFilter } from "@/components/storefront/catalog-filter";
import { listingFilters } from "@/modules/catalog/listing-query";
import { getDisplayPrices, getVariantDisplayPrices } from "@/modules/pricing";
import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/storefront/product-card";
import { SearchBox } from "@/components/storefront/search-box";
import { getRequestContext } from "@/lib/request-context";
import {
  catalogFacets,
  catalogText,
  listCatalogProducts,
  type CatalogLocale,
} from "@/modules/catalog";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const q = (one(query.q) ?? "").slice(0, 200);
  const collectionId = one(query.collectionId)?.slice(0, 100);
  const collection = collectionId
    ? await db.collection.findFirst({
        where: { id: collectionId, deletedAt: null },
        select: { id: true, titleI18n: true },
      })
    : null;
  if (collectionId && !collection) notFound();
  const safe = locale as CatalogLocale;
  const [{ market }, t, facets] = await Promise.all([
    getRequestContext(locale),
    getTranslations("catalog"),
    catalogFacets(),
  ]);
  const result = await listCatalogProducts(market.id, safe, {
    q,
    collectionId: collection?.id,
    limit: 24,
    ...listingFilters(query),
  });
  const [prices, variantPrices] = await Promise.all([
    getDisplayPrices(result.items, market),
    getVariantDisplayPrices(result.items, market),
  ]);
  return (
    <main
      className="shell shop-page py-10 md:py-16"
      dir={safe === "fa" ? "rtl" : "ltr"}
    >
      <h1 className="text-4xl font-semibold">
        {collection
          ? (collection.titleI18n as Record<string, string>)[locale] ||
            (collection.titleI18n as Record<string, string>).en
          : t("search")}
      </h1>
      <SearchBox
        locale={safe}
        marketId={market.id}
        marketCode={market.code}
        label={t("search")}
        placeholder={t("searchPlaceholder")}
        initial={q}
        collectionId={collection?.id}
      />
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
          brands: facets.brands.map((item) => ({
            id: item.id,
            label: catalogText(item.nameI18n, safe),
          })),
          colors: facets.colors.map((item) => ({
            id: item.id,
            label: catalogText(item.nameI18n, safe),
          })),
          sizes: facets.sizes.map((item) => ({
            id: item.id,
            label: item.value,
          })),
          materials: facets.materials,
        }}
      />
      <p className="mb-5 text-sm text-muted">
        {t("results", { count: result.total })}
      </p>
      {!result.items.length && (
        <div className="shop-empty">
          <p>{(await getTranslations("shopping"))("emptySearch")}</p>
          <Link
            className="button button-outline"
            href={`?${new URLSearchParams({ market: market.code, ...(collection ? { collectionId: collection.id } : {}) })}`}
          >
            {(await getTranslations("shopping"))("reset")}
          </Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {result.items.map((product) => (
          <ProductCard
            key={product.id}
            product={{ ...product, displayPrice: prices.get(product.id) }}
            variantPrices={variantPrices}
            locale={safe}
            market={market}
          />
        ))}
      </div>
      {result.nextCursor && (
        <Link
          className="button mt-8 inline-block"
          href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string")), q, after: result.nextCursor, page: String(result.page + 1), ...(collection ? { collectionId: collection.id } : {}) })}`}
        >
          {t("loadMore")}
        </Link>
      )}
    </main>
  );
}
