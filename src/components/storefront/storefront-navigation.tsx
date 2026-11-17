"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { StorefrontIcon } from "./storefront-icon";
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
    more: string;
    shortFitting: string;
    cart: string;
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
  const more = useRef<HTMLDetailsElement>(null);
  const moreToggle = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!enabled || inFitting || route.suppressed) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        more.current?.open &&
        target instanceof Node &&
        !more.current.contains(target)
      ) {
        more.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [enabled, inFitting, route.suppressed]);
  useEffect(() => {
    if (more.current) more.current.open = false;
  }, [pathname]);
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
  const [home, category, productItem, fitting, login, profile] = fittingItems;
  const cart = { key: "cart", href: local("cart") } as const;
  const primaryItems = [home, category, fitting, cart];
  const moreItems = [productItem, login, profile];
  const active = route.page === "cart" ? "cart" : fittingActive;

  if (!enabled || route.suppressed) return null;
  return (
    <nav
      ref={nav}
      className={`mobile-bottom-nav storefront-floating-nav${inFitting ? " moda-fr31-dock" : ""}`}
      aria-label={labels.navigation}
      data-testid="mobile-bottom-navigation"
    >
      {!inFitting && (
        <div className="storefront-dock-compact">
          {primaryItems.map(({ key, href }) => (
            <Link
              className="storefront-dock-target"
              key={key}
              href={href}
              prefetch={false}
              aria-current={active === key ? "page" : undefined}
              aria-label={key === "fitting" ? labels.fitting : undefined}
            >
              <StorefrontIcon name={key} />
              <span>
                {key === "fitting" ? labels.shortFitting : labels[key]}
              </span>
            </Link>
          ))}
          <details
            className="storefront-dock-more"
            ref={more}
            data-current={moreItems.some(({ key }) => key === active)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !more.current?.open) return;
              event.preventDefault();
              event.stopPropagation();
              more.current.open = false;
              moreToggle.current?.focus();
            }}
          >
            <summary className="storefront-dock-target" ref={moreToggle}>
              <StorefrontIcon name="more" />
              <span>{labels.more}</span>
            </summary>
            <ul className="storefront-dock-menu">
              {moreItems.map(({ key, href }) => (
                <li key={key}>
                  <Link
                    className="storefront-dock-menu-link"
                    href={href}
                    prefetch={false}
                    aria-current={active === key ? "page" : undefined}
                    onClick={() => {
                      if (more.current) more.current.open = false;
                    }}
                  >
                    {labels[key]}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <>
        {fittingItems.map((item) => (
          <Link
            className="storefront-dock-original"
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
            href={cart.href}
            prefetch={false}
          >
            {labels.cart}
          </Link>
        )}
      </>
    </nav>
  );
}
