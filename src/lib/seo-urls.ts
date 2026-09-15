export const SEO_LOCALES = ["fa", "tr", "en"] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];
export type SeoKind = "home" | "p" | "c" | "pages";
export function seoPath(
  locale: string,
  market: string,
  kind: SeoKind = "home",
  slug = "",
) {
  const root = `/${locale}/m/${encodeURIComponent(market)}`;
  return kind === "home" ? root : `${root}/${kind}/${encodeURIComponent(slug)}`;
}
/** Only public storefront pages can be rewritten, never account/admin/API routes. */
export function parseSeoPath(pathname: string) {
  const match =
    /^\/(fa|tr|en)\/m\/([A-Za-z0-9_-]{1,40})(?:\/(p|c|pages)\/([^/]+))?\/?$/.exec(
      pathname,
    );
  if (!match) return null;
  return {
    locale: match[1] as SeoLocale,
    market: match[2],
    target: `/${match[1]}${match[3] ? `/${match[3]}/${match[4]}` : ""}`,
  };
}
export function privateSeoPath(pathname: string) {
  return (
    /^\/(admin|api)(\/|$)/.test(pathname) ||
    /^\/(fa|tr|en)\/(account|cart|checkout|orders|tracking|search)(\/|$)/.test(
      pathname,
    )
  );
}
export function switchedMarketPath(
  pathname: string,
  market: { code: string; enabledLocales: string[]; defaultLocale: string },
) {
  const route = parseSeoPath(pathname);
  if (!route) return null;
  // Without an enabled current language we cannot invent the translated slug.
  // Open the destination market's home in its configured default language.
  if (!market.enabledLocales.includes(route.locale))
    return seoPath(market.defaultLocale, market.code);
  return (
    seoPath(route.locale, market.code) +
    route.target.slice(route.locale.length + 1)
  );
}
