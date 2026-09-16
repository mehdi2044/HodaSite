"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StorefrontIcon } from "./storefront-icon";
export function CartDrawer({
  locale,
  items,
  currency,
}: {
  locale: string;
  items: { title: string; quantity: number }[];
  currency: string;
}) {
  const t = useTranslations("commerce");
  const count = items.reduce((n, item) => n + item.quantity, 0);
  const label = `${t("cart")} (${count})`;
  return (
    <details>
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
        <h2 className="font-semibold">
          {t("cart")} · {currency}
        </h2>
        {items.length ? (
          items.slice(0, 5).map((i, n) => (
            <p key={n}>
              {i.title} × {i.quantity}
            </p>
          ))
        ) : (
          <p className="text-muted">{t("empty")}</p>
        )}
        <Link className="button text-center" href={`/${locale}/cart`}>
          {t("viewCart")}
        </Link>
      </section>
    </details>
  );
}
