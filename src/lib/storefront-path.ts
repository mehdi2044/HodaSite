import { parseSeoPath, seoPath } from "./seo-urls";

export const marketCodePattern = /^[A-Za-z0-9_-]{1,40}$/;

export function isMarketContextPath(pathname: string) {
  return /^\/(fa|tr|en)\/(?:search|cart|checkout|fitting-room(?:\/coins)?|account(?:\/(?:login|wishlist|preferences))?)\/?$/.test(
    pathname,
  );
}

export function storefrontPath(
  locale: string,
  market: string | undefined,
  path: string,
  params?: Record<string, string>,
) {
  const query = new URLSearchParams(params);
  if (market) query.set("market", market);
  const search = query.toString();
  return `/${locale}/${path}${search ? `?${search}` : ""}`;
}

export function storefrontLoginPath(
  locale: string,
  market: string,
  next: string,
) {
  return storefrontPath(locale, market, "account/login", { next });
}

/** Market-neutral CMS links use the same destinations as storefront controls. */
export function storefrontMenuHref(
  href: string,
  locale: string,
  market: string,
) {
  if (!href.startsWith("/")) return href;
  if (/^\/[/\\]|[\\\r\n]/.test(href)) return undefined;
  const url = new URL(href, "https://storefront.invalid");
  const path = url.pathname.replace(/^\/(fa|tr|en)(?=\/|$)/, "");
  const canonical = parseSeoPath(url.pathname);
  if (canonical) {
    url.pathname =
      seoPath(canonical.locale, market) +
      canonical.target.slice(canonical.locale.length + 1);
    url.searchParams.delete("market");
  } else if (!path || path === "/") {
    url.pathname = seoPath(locale, market);
    url.searchParams.delete("market");
  } else if (
    /^\/(search|fitting-room|cart|checkout|account)(\/|$)/.test(path)
  ) {
    url.pathname = `/${locale}${path}`;
    url.searchParams.set("market", market);
  } else if (/^\/(p|c|pages)\/[^/]+\/?$/.test(path)) {
    const slugLocale = /^\/(fa|tr|en)\//.exec(url.pathname)?.[1] ?? locale;
    url.pathname = seoPath(slugLocale, market) + path.replace(/\/$/, "");
    url.searchParams.delete("market");
  } else {
    return href;
  }
  return url.pathname + url.search + url.hash;
}
