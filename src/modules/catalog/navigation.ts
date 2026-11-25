import { seoPath, parseSeoPath, type SeoLocale } from "@/lib/seo-urls";
import { findCategoryBySlug, findProductBySlug } from "./queries";
import {
  editorialSlug,
  publishedBySlug,
  publishedEntry,
} from "@/modules/editorial/queries";
import { getPublishedPage } from "@/modules/content";

/** Resolve the same public entity's translated slug, never private/auth routes. */
export async function localizedStorefrontPath(
  pathname: string,
  target: SeoLocale,
  market: { id: string; code: string; enabledLocales: string[] },
  destination = market,
) {
  const canonical = parseSeoPath(pathname);
  const source = canonical?.target ?? pathname;
  if (!destination.enabledLocales.includes(target)) return null;
  const editorial = /^\/(fa|tr|en)\/(looks|magazine)(?:\/([^/]+))?\/?$/.exec(
    source,
  );
  if (editorial) {
    const [, locale, route, value] = editorial;
    const kind = route === "looks" ? "looks" : "magazine";
    const listing = seoPath(target, destination.code, kind);
    if (!value) return listing;
    let slug: string;
    try {
      slug = decodeURIComponent(value);
    } catch {
      return null;
    }
    const entityType = kind === "looks" ? "LOOK" : "ARTICLE";
    const entry = await publishedBySlug(
      entityType,
      locale as SeoLocale,
      slug,
      market.id,
    );
    const localized =
      entry &&
      (destination.id === market.id
        ? entry
        : await publishedEntry(entityType, { id: entry.id }, destination.id));
    return localized
      ? seoPath(
          target,
          destination.code,
          kind,
          editorialSlug(localized, target),
        )
      : listing;
  }
  const match = /^\/(fa|tr|en)\/(p|c|pages)\/([^/]+)\/?$/.exec(source);
  if (!match || destination.id !== market.id) return null;
  const locale = match[1] as SeoLocale;
  const kind = match[2] as "p" | "c" | "pages";
  const entity =
    kind === "p"
      ? await findProductBySlug(market.id, locale, match[3])
      : kind === "c"
        ? await findCategoryBySlug(locale, match[3])
        : await getPublishedPage(match[3], locale, market.id);
  if (!entity) return null;
  const slug = (entity.slugI18n as Record<string, string>)[target];
  return slug ? seoPath(target, market.code, kind, slug) : null;
}
