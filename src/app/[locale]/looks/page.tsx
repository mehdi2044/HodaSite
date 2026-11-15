import { Fragment } from "react";
import { supportsLookFitting } from "@/modules/editorial/fitting";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getRequestContext } from "@/lib/request-context";
import { seoPath } from "@/lib/seo-urls";
import {
  audiences,
  colors,
  locales,
  occasions,
  seasons,
  styles,
  type EditorialLocale,
} from "@/modules/editorial/contracts";
import {
  galleryFilters,
  listLooks,
  withinPrice,
} from "@/modules/editorial/gallery";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { readyImages } from "@/modules/editorial/queries";
import { CuratedCard } from "@/components/storefront/curated-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: EditorialLocale }>;
}) {
  const { locale } = await params;
  const [{ market }, t] = await Promise.all([
    getRequestContext(locale),
    getTranslations({ locale, namespace: "editorial" }),
  ]);
  return {
    title: t("gallery"),
    alternates: { canonical: seoPath(locale, market.code, "looks") },
  };
}

export default async function LooksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: EditorialLocale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale)) notFound();
  const filters = galleryFilters.parse(await searchParams);
  const [{ market }, t] = await Promise.all([
    getRequestContext(locale),
    getTranslations("editorial"),
  ]);
  const all = await listLooks(market.id, filters);
  const limit = 12;
  const offset = (filters.page - 1) * limit;
  const priceFilter = filters.min || filters.max;
  const candidates = priceFilter ? all : all.slice(offset, offset + limit);
  const commerce = await resolveLookCommerce(
    candidates.map((entry) => entry.body),
    market,
    locale,
  );
  const filtered = candidates.flatMap((look, index) =>
    withinPrice(commerce[index].amount, filters)
      ? [{ look, commerce: commerce[index] }]
      : [],
  );
  const rows = priceFilter ? filtered.slice(offset, offset + limit) : filtered;
  const total = priceFilter ? filtered.length : all.length;
  const images = await readyImages(
    rows.flatMap(({ look }) => [
      look.body.mediaId,
      look.body.mobileMediaId ?? look.body.mediaId,
    ]),
  );
  const fitting = await Promise.all(
    rows.map(({ look }) => supportsLookFitting(look.body)),
  );
  const path = seoPath(locale, market.code, "looks");
  const facets = [
    ["audience", audiences],
    ["season", seasons],
    ["occasion", occasions],
    ["style", styles],
    ["color", colors],
  ] as const;
  function pageHref(page: number) {
    const query = new URLSearchParams(
      Object.entries(filters).flatMap(([k, v]) =>
        k === "page" || v === undefined ? [] : [[k, String(v)]],
      ),
    );
    query.set("page", String(page));
    return `${path}?${query}`;
  }
  return (
    <main className="shell editorial-page">
      <header className="editorial-heading">
        <Link href={seoPath(locale, market.code, "magazine")}>
          {t("magazine")}
        </Link>
        <h1>{t("gallery")}</h1>
      </header>
      <form className="editorial-filters" action={path}>
        {facets.map(([facet, options]) => (
          <label key={facet}>
            {t(facet === "color" ? "palette" : facet)}
            <select
              className="input"
              name={facet}
              defaultValue={filters[facet] ?? ""}
            >
              <option value="">{t("all")}</option>
              {options.map((option) => (
                <option value={option} key={option}>
                  {t(`facet.${option}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(["min", "max"] as const).map((key) => (
          <label key={key}>
            {t(key)} ({market.currency})
            <input
              className="input"
              inputMode="decimal"
              name={key}
              defaultValue={filters[key]}
            />
          </label>
        ))}
        <label>
          {t("sort")}
          <select className="input" name="sort" defaultValue={filters.sort}>
            {(["newest", "popular", "featured"] as const).map((value) => (
              <option value={value} key={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
        <button className="button">{t("filter")}</button>
      </form>
      {rows.length ? (
        <Fragment key="editorial-gallery-results">
          <div className="editorial-grid">
            {rows.map(({ look, commerce }, index) => (
              <CuratedCard
                key={look.id}
                t={t}
                fitting={fitting[index]}
                look={look}
                commerce={commerce}
                locale={locale}
                market={market}
                images={images}
              />
            ))}
          </div>
        </Fragment>
      ) : (
        <p className="editorial-empty">{t("empty")}</p>
      )}
      <div className="editorial-link-row">
        {filters.page > 1 && (
          <Link href={pageHref(filters.page - 1)}>{t("previous")}</Link>
        )}
        {offset + limit < total && (
          <Link href={pageHref(filters.page + 1)}>{t("next")}</Link>
        )}
      </div>
    </main>
  );
}
