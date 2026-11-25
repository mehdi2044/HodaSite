import { supportsLookFitting } from "@/modules/editorial/fitting";
import Link from "next/link";
import { Fragment } from "react";
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
import { CuratedCard } from "@/components/storefront/curated-card";
import { WeeklyEditorial } from "@/components/storefront/weekly-editorial";
import { GalleryEntrance } from "@/components/storefront/living-rail";

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
  const showEntrances =
    !filters.audience &&
    !filters.season &&
    !filters.occasion &&
    !filters.style &&
    !filters.color &&
    !priceFilter &&
    filters.page === 1;
  const hero = showEntrances
    ? rows.find(
        ({ look }) => look.body.featured && look.visual?.mode === "PHOTO",
      )
    : undefined;
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
  function href(overrides: Partial<typeof filters>) {
    const query = new URLSearchParams(
      Object.entries({ ...filters, ...overrides }).flatMap(([k, v]) =>
        v === undefined ||
        (k === "page" && v === 1) ||
        (k === "sort" && v === "newest")
          ? []
          : [[k, String(v)]],
      ),
    );
    return query.size ? `${path}?${query}` : path;
  }
  return (
    <main className="shell editorial-page lookbook">
      <header className="editorial-mast">
        <Link href={seoPath(locale, market.code, "magazine")}>
          {t("magazine")}
        </Link>
        {!hero && <h1>{t("gallery")}</h1>}
      </header>
      {hero && (
        <GalleryEntrance
          t={t}
          look={hero.look}
          commerce={hero.commerce}
          locale={locale}
          market={market}
          hero
          fitting={fitting[rows.indexOf(hero)]}
        />
      )}
      <div className="editorial-merch">
        <nav className="editorial-tabs" aria-label={t("audience")}>
          {[undefined, ...audiences].map((audience) => (
            <Link
              key={audience ?? "all"}
              href={href({ audience, page: 1 })}
              aria-current={filters.audience === audience ? "page" : undefined}
            >
              {audience ? t(`facet.${audience}`) : t("all")}
            </Link>
          ))}
        </nav>
        <details className="editorial-filter-panel">
          <summary>{t("filters")}</summary>
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
                {t(key)} (
                {market.currency === "IRT" ? t("toman") : market.currency})
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
        </details>
      </div>
      {hero && <h2 className="editorial-collection-title">{t("gallery")}</h2>}
      <div className="editorial-grid" id="look-results">
        {rows.length ? (
          <>
            {rows.map(({ look, commerce }, index) => (
              <CuratedCard
                key={look.id}
                t={t}
                fitting={fitting[index]}
                look={look}
                commerce={commerce}
                locale={locale}
                market={market}
              />
            ))}
          </>
        ) : (
          <p className="editorial-empty">{t("empty")}</p>
        )}
      </div>
      <div className="editorial-link-row">
        {filters.page > 1 && (
          <Link href={href({ page: filters.page - 1 })}>{t("previous")}</Link>
        )}
        {offset + limit < total && (
          <Link href={href({ page: filters.page + 1 })}>{t("next")}</Link>
        )}
      </div>
      {/* Keep the async weekly section off the main element's hydration work unit. */}
      <Fragment key="gallery-weekly">
        <WeeklyEditorial
          locale={locale}
          market={market}
          compact
          gallery
          Card={showEntrances ? GalleryEntrance : undefined}
        />
      </Fragment>
    </main>
  );
}
