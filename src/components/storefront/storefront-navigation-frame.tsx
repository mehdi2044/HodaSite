"use client";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
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
  const pathname = usePathname();
  const route = storefrontNavigationRoute(pathname);
  const scroll = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (!window.location.hash) scroll.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div
      className="storefront-app"
      lang={locale}
      dir={locale === "fa" ? "rtl" : "ltr"}
      data-floating-navigation={enabled && !route.suppressed ? "on" : "off"}
      data-navigation-context={route.fitting ? "fitting" : "public"}
    >
      <div className="storefront-scroll" ref={scroll}>
        {/* Give streamed children a separate work unit so they cannot suspend
            the already-claimed scroll div during hydration replay. */}
        <Fragment key="storefront-scroll-content">{children}</Fragment>
      </div>
    </div>
  );
}
