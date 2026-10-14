"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseSeoPath, seoPath } from "@/lib/seo-urls";
import { usePathname, useSearchParams } from "next/navigation";

const LABELS: Record<string, string> = {
  fa: "فارسی",
  tr: "Türkçe",
  en: "English",
};

export function LocaleSwitcher({
  current,
  enabledLocales,
  ariaLabel,
  mobile = false,
  compact = false,
}: {
  current: string;
  enabledLocales: string[];
  ariaLabel: string;
  mobile?: boolean;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const queryString = useSearchParams().toString();
  const rest = pathname.split("/").slice(2).join("/");
  const canonical = parseSeoPath(pathname);
  const entityPath =
    /^\/(fa|tr|en)\/(?:m\/[A-Za-z0-9_-]{1,40}\/)?(?:p|c|pages)\/[^/]+\/?$/.test(
      pathname,
    );
  const [resolved, setResolved] = useState<{
    path: string;
    links: Record<string, string>;
  }>({ path: "", links: {} });
  const [search, setSearch] = useState("");
  const localesKey = enabledLocales.join(",");
  useEffect(() => {
    // Preserve catalog filters, never authentication/unsubscribe query tokens.
    if (/^\/(fa|tr|en)\/search\/?$/.test(pathname)) {
      const query = new URLSearchParams(queryString);
      const kept = new URLSearchParams();
      for (const key of [
        "q",
        "collectionId",
        "categoryId",
        "colorId",
        "sizeId",
        "brandId",
        "material",
        "available",
        "after",
        "sort",
        "page",
        "minPrice",
        "maxPrice",
      ])
        for (const value of query.getAll(key)) kept.append(key, value);
      setSearch(kept.size ? `?${kept}` : "");
    } else if (/\/(?:p)\/[^/]+\/?$/.test(pathname)) {
      const color = new URLSearchParams(queryString).get("color");
      setSearch(
        color && /^[A-Za-z0-9_-]{1,100}$/.test(color)
          ? `?${new URLSearchParams({ color })}`
          : "",
      );
    } else setSearch("");
    if (!entityPath) return;
    const controller = new AbortController();
    void Promise.all(
      localesKey.split(",").map(async (target) => {
        const response = await fetch(
          `/api/catalog/localized-path?${new URLSearchParams({ pathname, target })}`,
          { signal: controller.signal },
        );
        if (!response.ok) return [target, ""];
        const result = (await response.json()) as { href?: string | null };
        return [
          target,
          result.href?.startsWith(`/${target}/m/`) ? result.href : "",
        ];
      }),
    )
      .then((links) => {
        if (!controller.signal.aborted)
          setResolved({ path: pathname, links: Object.fromEntries(links) });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [pathname, entityPath, localesKey, queryString]);
  const href = (locale: string) => {
    if (locale === current) return pathname + search;
    if (entityPath)
      return (
        ((resolved.path === pathname && resolved.links[locale]) ||
          (canonical ? seoPath(locale, canonical.market) : `/${locale}`)) +
        search
      );
    return `/${locale}/${rest}` + search;
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={
        compact
          ? "storefront-languages"
          : mobile
            ? "flex flex-wrap gap-1 text-base"
            : "hidden gap-1 text-sm lg:flex"
      }
    >
      {enabledLocales.map((locale) => (
        <Link
          key={locale}
          href={href(locale)}
          aria-current={locale === current ? "true" : undefined}
          aria-label={LABELS[locale] ?? locale}
          className={
            compact
              ? undefined
              : `flex min-h-11 items-center rounded-full px-3 ${locale === current ? "bg-surface font-semibold shadow-sm" : "text-muted"}`
          }
        >
          {compact ? locale.toUpperCase() : (LABELS[locale] ?? locale)}
        </Link>
      ))}
    </nav>
  );
}
