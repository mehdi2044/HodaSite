"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StorefrontIcon } from "./storefront-icon";
export function MobileNavigation({
  locale,
  labels,
}: {
  locale: string;
  labels: {
    navigation: string;
    home: string;
    search: string;
    cart: string;
    account: string;
  };
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "";
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
    { key: "cart", href: `/${locale}/cart` },
    { key: "account", href: `/${locale}/account` },
  ] as const;
  return (
    <nav
      className="mobile-bottom-nav"
      aria-label={labels.navigation}
      data-testid="mobile-bottom-navigation"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          prefetch={
            item.key === "cart" || item.key === "account" ? false : undefined
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
