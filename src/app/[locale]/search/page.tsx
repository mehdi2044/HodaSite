import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/storefront/product-card";
import { SearchBox } from "@/components/storefront/search-box";
import { getRequestContext } from "@/lib/request-context";
import { listCatalogProducts, type CatalogLocale } from "@/modules/catalog";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ locale }, { q = "" }] = await Promise.all([params, searchParams]);
  const safe = locale as CatalogLocale;
  const [{ market }, t] = await Promise.all([
    getRequestContext(locale),
    getTranslations("catalog"),
  ]);
  const result = await listCatalogProducts(market.id, safe, { q, limit: 24 });
  return (
    <main
      className="shell shop-page py-10 md:py-16"
      dir={safe === "fa" ? "rtl" : "ltr"}
    >
      <h1 className="text-4xl font-semibold">{t("search")}</h1>
      <SearchBox
        locale={safe}
        marketId={market.id}
        label={t("search")}
        placeholder={t("searchPlaceholder")}
        initial={q}
      />
      <p className="mb-5 text-sm text-muted">
        {t("results", { count: result.total })}
      </p>
      {!result.items.length && (
        <div className="shop-empty">
          <p>{(await getTranslations("shopping"))("emptySearch")}</p>
        </div>
      )}
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
    </main>
  );
}
