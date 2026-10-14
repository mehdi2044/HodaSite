"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CommerceForm } from "./commerce-form";
import { updateCartAction } from "@/app/[locale]/commerce-actions";
export type CardColorView = {
  id: string;
  name: string;
  hex: string;
  price: string;
  image: ReactNode;
  photoFallback?: boolean;
  variants: { id: string; size: string; available: number; price: string }[];
};
export function ModaProductCard({
  href,
  title,
  colors,
  wishlist,
  locale,
  kids = false,
  note,
  readOnly = false,
}: {
  href: string;
  title: string;
  colors: CardColorView[];
  wishlist: ReactNode;
  locale: string;
  kids?: boolean;
  note?: ReactNode;
  readOnly?: boolean;
}) {
  const t = useTranslations("shopping"),
    root = useRef<HTMLElement>(null),
    frame = useRef(0),
    allowed = useRef(false);
  const [colorId, setColor] = useState(colors[0]?.id);
  const color = colors.find((color) => color.id === colorId) ?? colors[0];
  const reset = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    root.current?.style.setProperty("--card-x", "0deg");
    root.current?.style.setProperty("--card-y", "0deg");
    root.current?.style.setProperty("--card-glare", "0");
  };
  useEffect(() => {
    const preference = matchMedia(
      "(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)",
    );
    let visible = false;
    const update = () => {
      allowed.current =
        preference.matches && visible && !document.hidden && !kids;
      if (!allowed.current) reset();
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      update();
    });
    if (root.current) observer.observe(root.current);
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      reset();
    };
  }, [kids]);
  if (!color) return null;
  return (
    <article
      ref={root}
      className="shop-product-card moda-product-card"
      onPointerLeave={reset}
      onFocusCapture={reset}
      onPointerMove={(event) => {
        if (
          !allowed.current ||
          event.pointerType !== "mouse" ||
          root.current?.contains(document.activeElement)
        )
          return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width),
          ),
          y = Math.max(
            0,
            Math.min(1, (event.clientY - bounds.top) / bounds.height),
          );
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          const node = root.current;
          if (!node || !allowed.current) return;
          node.style.setProperty("--card-y", `${(x - 0.5) * 20}deg`);
          node.style.setProperty("--card-x", `${(0.5 - y) * 16}deg`);
          node.style.setProperty("--card-glare", ".45");
          node.style.setProperty("--glare-x", `${x * 100}%`);
          node.style.setProperty("--glare-y", `${y * 100}%`);
        });
      }}
    >
      <div className="moda-card-visual">
        <Link
          href={`${href}?color=${encodeURIComponent(color.id)}`}
          className="shop-product-link moda-card-image-link"
          aria-hidden="true"
          tabIndex={-1}
        >
          {color.image}
          <span className="moda-card-glare" aria-hidden="true" />
        </Link>
        <div className="shop-card-wishlist">{wishlist}</div>
        {readOnly ? (
          <div className="moda-card-quick-sizes">
            {" "}
            {color.variants.map((variant) => (
              <button
                key={variant.id}
                type={readOnly ? "button" : "submit"}
                name="variantId"
                value={variant.id}
                disabled={readOnly || variant.available <= 0}
                aria-label={t("quickAddSize", { size: variant.size })}
                title={variant.price}
              >
                {variant.size}
              </button>
            ))}
          </div>
        ) : (
          <CommerceForm
            action={updateCartAction.bind(null, locale)}
            className="moda-card-quick-sizes"
          >
            <input type="hidden" name="mode" value="add" />
            <input type="hidden" name="quantity" value="1" />{" "}
            {color.variants.map((variant) => (
              <button
                key={variant.id}
                type={readOnly ? "button" : "submit"}
                name="variantId"
                value={variant.id}
                disabled={readOnly || variant.available <= 0}
                aria-label={t("quickAddSize", { size: variant.size })}
                title={variant.price}
              >
                {variant.size}
              </button>
            ))}
          </CommerceForm>
        )}
      </div>
      <div className="shop-card-copy p-4">
        <div
          className="moda-card-swatches"
          role="group"
          aria-label={t("cardColor")}
        >
          {colors.map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-label={choice.name}
              title={choice.name}
              aria-pressed={choice.id === color.id}
              onClick={() => setColor(choice.id)}
            >
              <span style={{ backgroundColor: choice.hex }} />
            </button>
          ))}
        </div>
        <h3>
          <Link href={`${href}?color=${encodeURIComponent(color.id)}`}>
            {title}
          </Link>
        </h3>
        {color.photoFallback && note}
        {color.variants.every((variant) => variant.available <= 0) && (
          <p>{t("cardOutOfStock")}</p>
        )}
        <p className="moda-price mt-2">
          <bdi>{color.price}</bdi>
        </p>
      </div>
    </article>
  );
}
