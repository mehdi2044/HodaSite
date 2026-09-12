/** Locale-neutral storefront destinations in CMS. Explicit locales, external
 * links, anchors and administrative paths retain the merchant's destination. */
export function storefrontHref(href: string, locale: "fa" | "tr" | "en") {
  if (
    /^\/(?:search|cart|checkout|account|tracking|c|p|pages)(?:[/?#]|$)/.test(
      href,
    ) ||
    href === "/"
  )
    return `/${locale}${href === "/" ? "" : href}`;
  return href;
}
