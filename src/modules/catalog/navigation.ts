import { seoPath, parseSeoPath, type SeoLocale } from "@/lib/seo-urls";
import { findCategoryBySlug, findProductBySlug } from "./queries";
import { editorialSlug, publishedBySlug } from "@/modules/editorial/queries";
import { getPublishedPage } from "@/modules/content";

/** Resolve the same public entity's translated slug, never private/auth routes. */
export async function localizedStorefrontPath(
  pathname: string,
  target: SeoLocale,
  market: { id: string; code: string; enabledLocales: string[] },
) {
  const canonical = parseSeoPath(pathname);
  const source = canonical?.target ?? pathname;
  if (!market.enabledLocales.includes(target)) return null;
  const editorial = /^\/(fa|tr|en)\/(looks|magazine)(?:\/([^/]+))?\/?$/.exec(
    source,
  );
  if (editorial) {
    const [, locale, route, value] = editorial;
    const kind = route === "looks" ? "looks" : "magazine";
    if (!value) return seoPath(target, market.code, kind);
    let slug: string;
    try {
      slug = decodeURIComponent(value);
    } catch {
      return null;
    }
    const entry = await publishedBySlug(
      kind === "looks" ? "LOOK" : "ARTICLE",
      locale as SeoLocale,
      slug,
      market.id,
    );
    return entry
      ? seoPath(target, market.code, kind, editorialSlug(entry, target))
      : null;
  }
  const match = /^\/(fa|tr|en)\/(p|c|pages)\/([^/]+)\/?$/.exec(source);
  if (!match || !market.enabledLocales.includes(target)) return null;
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
