"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { storefrontNavigationRoute } from "@/lib/storefront-navigation";

export function StorefrontNavigationFrame({
  enabled,
  locale,
  children,
}: {
  enabled: boolean;
  locale: string;
  children: ReactNode;
}) {
  const route = storefrontNavigationRoute(usePathname());
  return (
    <div
      className="storefront-app"
      lang={locale}
      dir={locale === "fa" ? "rtl" : "ltr"}
      data-floating-navigation={enabled && !route.suppressed ? "on" : "off"}
      data-navigation-context={route.fitting ? "fitting" : "public"}
    >
      {children}
    </div>
  );
}
