"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { StorefrontIcon } from "./storefront-icon";
export function MobileNavigation({
  locale,
  marketCode,
  fittingLinks,
  labels,
}: {
  locale: string;
  marketCode?: string;
  fittingLinks: { home: string; category: string; product: string };
  labels: {
    navigation: string;
    home: string;
    search: string;
    cart: string;
    account: string;
    category: string;
    product: string;
    fitting: string;
    login: string;
    profile: string;
  };
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const inFitting =
    pathname.split("/")[2] === "fitting-room" ||
    params.get("fittingNav") === "1";
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const observe = () => {
      const height = element.getBoundingClientRect().height;
      const dockGap = inFitting ? 8 : 0;
      if (height > 0)
        document.documentElement.style.setProperty(
          "--storefront-nav-offset",
          `calc(${height + dockGap}px - env(safe-area-inset-bottom, 0px))`,
        );
      else
        document.documentElement.style.removeProperty(
          "--storefront-nav-offset",
        );
    };
    const observer = new ResizeObserver(observe);
    observer.observe(element);
    observe();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--storefront-nav-offset");
    };
  }, [inFitting]);
  const segments = pathname.split("/");
  const segment =
    segments[2] === "m" ? (segments[4] ?? "") : (segments[2] ?? "");
  const active = ["cart", "checkout"].includes(segment)
    ? "cart"
    : ["account", "orders", "tracking", "returns"].includes(segment)
      ? "account"
      : ["search", "c", "p"].includes(segment)
        ? "search"
        : segment === ""
          ? "home"
          : null;
  const items = [
    { key: "home", href: `/${locale}` },
    { key: "search", href: `/${locale}/search` },
    {
      key: "cart",
      href: `/${locale}/cart${marketCode ? `?market=${encodeURIComponent(marketCode)}` : ""}`,
    },
    { key: "account", href: `/${locale}/account` },
  ] as const;
  const fittingActive =
    segment === "fitting-room"
      ? "fitting"
      : segment === "account"
        ? segments[3] === "login"
          ? "login"
          : "profile"
        : segment === "p"
          ? "product"
          : ["c", "search"].includes(segment)
            ? "category"
            : segment === ""
              ? "home"
              : null;
  const local = (path: string) =>
    `/${locale}/${path}?market=${encodeURIComponent(marketCode ?? "")}`;
  const fittingItems = [
    { key: "home", href: fittingLinks.home },
    { key: "category", href: fittingLinks.category },
    { key: "product", href: fittingLinks.product },
    { key: "fitting", href: local("fitting-room") },
    { key: "login", href: local("account/login") },
    { key: "profile", href: local("account") },
  ] as const;
  return (
    <nav
      ref={nav}
      className={`mobile-bottom-nav${inFitting ? " moda-fr31-dock" : ""}`}
      aria-label={labels.navigation}
      data-testid="mobile-bottom-navigation"
    >
      {inFitting
        ? fittingItems.map((item) => (
            <Link
              key={item.key}
              href={`${item.href}${item.href.includes("?") ? "&" : "?"}fittingNav=1`}
              prefetch={false}
              aria-current={fittingActive === item.key ? "page" : undefined}
            >
              {labels[item.key]}
            </Link>
          ))
        : items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              prefetch={
                item.key === "cart" || item.key === "account"
                  ? false
                  : undefined
              }
              aria-current={active === item.key ? "page" : undefined}
            >
              <span className="mobile-nav-symbol">
                <StorefrontIcon name={item.key} />
              </span>
              <span>{labels[item.key]}</span>
            </Link>
          ))}
    </nav>
  );
}
