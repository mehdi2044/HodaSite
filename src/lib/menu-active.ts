import { parseSeoPath } from "./seo-urls";

/** Treat an article as part of its journal, preserving language and market. */
export function menuLinkIsActive(href: string, pathname: string | null) {
  if (!pathname || !href.startsWith("/") || href.startsWith("//")) return false;
  const target = href.split(/[?#]/)[0].replace(/\/$/, "");
  const current = pathname.replace(/\/$/, "");
  const canonical = parseSeoPath(target);
  const route = parseSeoPath(current);
  if (canonical && route && canonical.market !== route.market) return false;
  const expected = canonical?.target ?? target;
  const actual = route?.target ?? current;
  return actual === expected || actual.startsWith(expected + "/");
}
