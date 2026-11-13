"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useFittingDockProduct } from "./fitting-dock-context";
import { storefrontNavigationRoute } from "@/lib/storefront-navigation";
import { useStorefrontProductHref } from "./storefront-product-context";
import { storefrontLoginPath, storefrontPath } from "@/lib/storefront-path";
export function StorefrontNavigation({
  enabled = true,
  locale,
  marketCode,
  fittingLinks,
  labels,
}: {
  enabled?: boolean;
  locale: string;
  marketCode?: string;
  fittingLinks: { home: string; category: string };
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
  const product = useFittingDockProduct()?.href;
  const route = storefrontNavigationRoute(pathname);
  const inFitting = route.fitting;
  const currentProduct = useStorefrontProductHref();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const observe = () => {
      const height = element.getBoundingClientRect().height;
      const dockGap = innerWidth < 1024 ? 8 : 34;
      if (height > 0)
        document.documentElement.style.setProperty(
          "--storefront-nav-offset",
          `${height + dockGap}px`,
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
  }, [inFitting, enabled, route.suppressed]);
  const fittingActive = route.active;
  const local = (path: string) => storefrontPath(locale, marketCode, path);
  const fittingItems = [
    { key: "home", href: fittingLinks.home },
    { key: "category", href: fittingLinks.category },
    {
      key: "product",
      href:
        (inFitting ? product : currentProduct) ??
        (inFitting
          ? local("fitting-room") + "#instant-gallery"
          : local("search")),
    },
    { key: "fitting", href: local("fitting-room") },
    {
      key: "login",
      href:
        inFitting && marketCode
          ? storefrontLoginPath(locale, marketCode, local("fitting-room"))
          : local("account/login"),
    },
    { key: "profile", href: local("account") },
  ] as const;
  if (!enabled || route.suppressed) return null;
  return (
    <nav
      ref={nav}
      className={`mobile-bottom-nav storefront-floating-nav${inFitting ? " moda-fr31-dock" : ""}`}
      aria-label={labels.navigation}
      data-testid="mobile-bottom-navigation"
    >
      <>
        {fittingItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            aria-current={fittingActive === item.key ? "page" : undefined}
          >
            {labels[item.key]}
          </Link>
        ))}
        {inFitting && (
          <Link
            className="moda-fr31-cart-shortcut"
            href={local("cart")}
            prefetch={false}
          >
            {labels.cart}
          </Link>
        )}
      </>
    </nav>
  );
}
