"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ResponsiveImage,
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";
type Entry = { id: string; media: ResponsiveImageMedia };
export function ProductGallery({
  base,
  variants,
  locale,
  initialColorId,
  initialVariantId,
}: {
  base: Entry[];
  variants: Array<{ id?: string; colorId: string; media: Entry[] }>;
  locale: "fa" | "tr" | "en";
  initialColorId?: string;
  initialVariantId?: string;
}) {
  const t = useTranslations("shopping"),
    [color, setColor] = useState(initialColorId ?? ""),
    [active, setActive] = useState(0),
    [variant, setVariant] = useState(initialVariantId ?? "");
  const track = useRef<HTMLDivElement>(null),
    zoom = useRef<HTMLDialogElement>(null),
    variantRef = useRef(initialVariantId ?? "");
  useEffect(() => {
    const listener = (e: Event) => {
      setColor((e as CustomEvent<string>).detail);
      setActive(0);
    };
    const variantListener = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (variantRef.current !== next) {
        variantRef.current = next;
        setVariant(next);
        setActive(0);
      }
    };
    window.addEventListener("catalog-color", listener);
    window.addEventListener("catalog-variant", variantListener);
    return () => {
      window.removeEventListener("catalog-color", listener);
      window.removeEventListener("catalog-variant", variantListener);
    };
  }, []);
  const items = useMemo(() => {
    const chosen = variants.find(
      (item) => item.id === variant && item.colorId === color,
    );
    if (chosen?.media.length) return chosen.media;
    const colorMedia = variants.find(
      (item) => item.colorId === color && item.media.length,
    );
    return colorMedia?.media ?? base;
  }, [base, variants, color, variant]);
  const mediaKey = JSON.stringify(
    items.map((item) => [item.id, item.media.url, item.media.variants]),
  );
  useEffect(() => {
    const root = track.current;
    if (!root) return;
    root.scrollLeft = 0;
    const desktop = matchMedia("(min-width:1024px)");
    let observer: IntersectionObserver;
    const connect = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter(
              (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6,
            )
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible[0])
            setActive(Number((visible[0].target as HTMLElement).dataset.index));
        },
        { root: desktop.matches ? null : root, threshold: 0.6 },
      );
      for (const child of root.children) observer.observe(child);
    };
    connect();
    desktop.addEventListener("change", connect);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", connect);
    };
  }, [mediaKey]);
  const move = (index: number) =>
    track.current?.children[index]?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  const current = items[active] || items[0];
  return (
    <section
      data-moda4="pdp-gallery"
      className="shop-gallery"
      aria-label={t("gallery")}
      aria-roledescription={t("carousel")}
    >
      <div
        className="shop-gallery-track"
        ref={track}
        tabIndex={0}
        onKeyDown={(event) => {
          const direction = locale === "fa" ? -1 : 1;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            move(
              Math.max(
                0,
                Math.min(
                  items.length - 1,
                  active +
                    (event.key === "ArrowRight" ? direction : -direction),
                ),
              ),
            );
          }
        }}
      >
        {items.length ? (
          items.map((item, index) => (
            <button
              type="button"
              className="shop-gallery-slide"
              data-index={index}
              key={item.id}
              aria-label={t("image", {
                number: index + 1,
                total: items.length,
              })}
              onClick={() => {
                setActive(index);
                zoom.current?.showModal();
              }}
            >
              <ResponsiveImage
                media={item.media}
                locale={locale}
                sizes="(max-width:1024px) 100vw, 50vw"
                priority={index === 0}
                role="gallery"
                className="shop-gallery-image"
                imgClassName="h-full w-full object-cover"
              />
            </button>
          ))
        ) : (
          <div className="shop-image-empty">{t("noImage")}</div>
        )}
      </div>
      {items.length > 0 && (
        <div className="shop-gallery-meta">
          <button
            type="button"
            className="shop-full-image"
            onClick={() => zoom.current?.showModal()}
          >
            {t("fullImage")} <span aria-hidden="true">↗</span>
          </button>
          <span aria-live="polite" aria-atomic="true">
            {t("galleryCount", {
              current: new Intl.NumberFormat(locale).format(active + 1),
              total: new Intl.NumberFormat(locale).format(items.length),
            })}
          </span>
        </div>
      )}
      {isDemoFashionMedia(current?.media) && (
        <p className="shop-demo-note">{t("demoImageNote")}</p>
      )}
      {items.length > 1 && (
        <div className="shop-gallery-dots">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-label={t("image", {
                number: index + 1,
                total: items.length,
              })}
              aria-pressed={index === active}
              onClick={() => move(index)}
            >
              <ResponsiveImage
                media={item.media}
                locale={locale}
                sizes="64px"
                role="thumbnail"
                className="shop-gallery-thumbnail"
              />
            </button>
          ))}
        </div>
      )}
      <dialog
        className="shop-gallery-zoom"
        ref={zoom}
        aria-label={t("gallery")}
      >
        <button
          className="shop-zoom-close"
          onClick={() => zoom.current?.close()}
        >
          {t("close")}
        </button>
        {current && (
          <ResponsiveImage
            media={current.media}
            locale={locale}
            sizes="100vw"
            role="full"
            className="block"
            imgClassName="w-full max-h-[85dvh] object-contain"
          />
        )}
      </dialog>
    </section>
  );
}
