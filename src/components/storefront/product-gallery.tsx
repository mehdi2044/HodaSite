"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";
type Entry = { id: string; media: ResponsiveImageMedia };
export function ProductGallery({
  base,
  variants,
  locale,
}: {
  base: Entry[];
  variants: Array<{ colorId: string; media: Entry[] }>;
  locale: "fa" | "tr" | "en";
}) {
  const t = useTranslations("shopping"),
    [color, setColor] = useState(""),
    [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null),
    zoom = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const listener = (e: Event) => {
      setColor((e as CustomEvent<string>).detail);
      setActive(0);
    };
    window.addEventListener("catalog-color", listener);
    return () => window.removeEventListener("catalog-color", listener);
  }, []);
  const items = useMemo(
    () =>
      variants.find((v) => v.colorId === color)?.media.length
        ? variants.find((v) => v.colorId === color)!.media
        : base,
    [base, variants, color],
  );
  useEffect(() => {
    const root = track.current;
    if (!root) return;
    root.scrollLeft = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting && e.intersectionRatio >= 0.6)
            setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    for (const child of root.children) observer.observe(child);
    return () => observer.disconnect();
  }, [items]);
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
    <section className="shop-gallery" aria-label={t("gallery")}>
      <div className="shop-gallery-track" ref={track} tabIndex={0}>
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
                className="shop-gallery-image"
                imgClassName="aspect-[3/4] h-full w-full object-cover"
              />
            </button>
          ))
        ) : (
          <div className="shop-image-empty">{t("noImage")}</div>
        )}
      </div>
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
              <span />
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
            className="block"
            imgClassName="w-full max-h-[85dvh] object-contain"
          />
        )}
      </dialog>
    </section>
  );
}
