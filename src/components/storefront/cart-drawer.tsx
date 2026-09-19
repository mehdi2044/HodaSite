"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";
import { useTranslations } from "next-intl";
import { StorefrontIcon } from "./storefront-icon";
export function CartDrawer({
  locale,
  items,
  currency,
}: {
  locale: string;
  items: { title: string; quantity: number; image?: ResponsiveImageMedia }[];
  currency: string;
}) {
  const t = useTranslations("commerce");
  const shopping = useTranslations("shopping");
  const disclosure = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (disclosure.current) disclosure.current.open = false;
  }, [pathname]);
  const count = items.reduce((n, item) => n + item.quantity, 0);
  const label = `${t("cart")} (${count})`;
  return (
    <details ref={disclosure}>
      <summary
        className="storefront-cart-toggle cursor-pointer py-3"
        aria-label={label}
      >
        <span className="storefront-cart-mobile" aria-hidden="true">
          <StorefrontIcon name="cart" />
          <bdi>{count}</bdi>
        </span>
        <span className="storefront-cart-desktop" aria-hidden="true">
          {label}
        </span>
      </summary>
      <section className="absolute inset-x-4 top-full z-50 mx-auto grid max-w-sm gap-4 rounded-token border border-black/10 bg-surface p-5 shadow-xl">
        <button
          type="button"
          className="justify-self-end min-h-11 px-2 text-sm underline"
          onClick={() => {
            if (disclosure.current) disclosure.current.open = false;
          }}
        >
          {shopping("close")}
        </button>
        <h2 className="font-semibold">
          {t("cart")} · {currency}
        </h2>
        {items.length ? (
          items.slice(0, 5).map((i, n) => (
            <div key={n} className="storefront-mini-cart-item">
              {i.image ? (
                <ResponsiveImage
                  media={i.image}
                  locale={locale as "fa" | "tr" | "en"}
                  role="thumbnail"
                  sizes="60px"
                />
              ) : (
                <span />
              )}
              <p>
                {i.title} × {new Intl.NumberFormat(locale).format(i.quantity)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-muted">{t("empty")}</p>
        )}
        <Link
          onClick={() => {
            if (disclosure.current) disclosure.current.open = false;
          }}
          className="button text-center"
          href={`/${locale}/cart`}
        >
          {t("viewCart")}
        </Link>
      </section>
    </details>
  );
}
