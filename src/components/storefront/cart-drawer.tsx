"use client";
import Link from "next/link";
import { CommerceForm } from "./commerce-form";
import { updateCartAction } from "@/app/[locale]/commerce-actions";
import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";
import { useTranslations } from "next-intl";
import { StorefrontIcon } from "./storefront-icon";
import { Iso } from "./iso";
export function CartDrawer({
  locale,
  items,
  currency,
  subtotal,
  total,
  marketMismatch = false,
  quoteUnavailable = false,
}: {
  locale: string;
  items: {
    id?: string;
    variantId?: string;
    title: string;
    quantity: number;
    image?: ResponsiveImageMedia;
    color?: string;
    size?: string;
    price?: string;
  }[];
  currency: string;
  subtotal?: string;
  total?: string;
  marketMismatch?: boolean;
  quoteUnavailable?: boolean;
}) {
  const t = useTranslations("commerce"),
    shopping = useTranslations("shopping");
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter(),
    [refreshing, startRefresh] = useTransition();
  useEffect(() => {
    const focus = () => {
      if (dialog.current?.open) startRefresh(() => router.refresh());
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [router]);
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);
  const count = items.reduce((n, item) => n + item.quantity, 0);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="moda-tool storefront-cart-toggle"
        aria-label={`${t("cart")} (${count})`}
        onClick={() => {
          dialog.current?.showModal();
          startRefresh(() => router.refresh());
        }}
      >
        <StorefrontIcon name="cart" />
        <bdi aria-hidden="true">{count}</bdi>
      </button>
      <dialog
        ref={dialog}
        className="moda-cart-drawer"
        aria-label={t("cart")}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <button
          type="button"
          className="moda-tool justify-self-end"
          onClick={() => dialog.current?.close()}
        >
          {shopping("close")}
        </button>
        <h2>
          {t("cart")} · <Iso>{currency}</Iso>
        </h2>
        {refreshing && <p role="status">{t("working")}</p>}
        {marketMismatch && <p role="status">{t("marketWarning")}</p>}
        {quoteUnavailable && <p role="status">{t("quoteUnavailable")}</p>}
        {items.length ? (
          items.slice(0, 5).map((item, n) => (
            <article key={item.id ?? n} className="moda-drawer-item">
              {item.image ? (
                <ResponsiveImage
                  media={item.image}
                  locale={locale as "fa" | "tr" | "en"}
                  role="thumbnail"
                  sizes="80px"
                />
              ) : (
                <span />
              )}
              <div>
                <h3>{item.title}</h3>
                <p>
                  {item.color} · <Iso>{item.size}</Iso> ×{" "}
                  {new Intl.NumberFormat(locale).format(item.quantity)}
                </p>
                {item.price && (
                  <p className="moda-price">
                    <Iso>{item.price}</Iso>
                  </p>
                )}
                {item.variantId && (
                  <CommerceForm
                    action={updateCartAction.bind(null, locale)}
                    className="moda-drawer-quantity"
                  >
                    <input
                      type="hidden"
                      name="variantId"
                      value={item.variantId}
                    />
                    <input type="hidden" name="mode" value="set" />
                    <button
                      type="submit"
                      name="quantity"
                      value={Math.max(0, item.quantity - 1)}
                      disabled={marketMismatch}
                      aria-label={shopping("decreaseQuantity", {
                        product: item.title,
                      })}
                    >
                      −
                    </button>
                    <bdi>
                      {new Intl.NumberFormat(locale).format(item.quantity)}
                    </bdi>
                    <button
                      type="submit"
                      name="quantity"
                      value={Math.min(100, item.quantity + 1)}
                      disabled={
                        marketMismatch ||
                        quoteUnavailable ||
                        item.quantity >= 100
                      }
                      aria-label={shopping("increaseQuantity", {
                        product: item.title,
                      })}
                    >
                      ＋
                    </button>
                    <button
                      type="submit"
                      name="quantity"
                      value="0"
                      disabled={marketMismatch}
                      className="moda-drawer-remove"
                    >
                      {shopping("remove")}
                    </button>
                  </CommerceForm>
                )}
              </div>
            </article>
          ))
        ) : (
          <p>{t("empty")}</p>
        )}
        {items.length > 5 && (
          <p>{t("moreCartItems", { count: items.length - 5 })}</p>
        )}
        {subtotal && (
          <p className="moda-drawer-total">
            {t("subtotal")}
            <Iso>{subtotal}</Iso>
          </p>
        )}
        {total && (
          <p className="moda-drawer-total">
            {t("estimate")}
            <Iso>{total}</Iso>
          </p>
        )}
        <Link
          className="button"
          href={`/${locale}/cart`}
          onClick={() => dialog.current?.close()}
        >
          {t("viewCart")}
        </Link>
      </dialog>
    </>
  );
}
