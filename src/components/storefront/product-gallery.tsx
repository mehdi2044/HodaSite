"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [color, setColor] = useState("");
  useEffect(() => {
    const listener = (event: Event) =>
      setColor((event as CustomEvent<string>).detail);
    window.addEventListener("catalog-color", listener);
    return () => window.removeEventListener("catalog-color", listener);
  }, []);
  const items = useMemo(
    () =>
      variants.find((item) => item.colorId === color)?.media.length
        ? variants.find((item) => item.colorId === color)!.media
        : base,
    [base, variants, color],
  );
  return (
    <div className="flex snap-x gap-3 overflow-x-auto lg:grid lg:grid-cols-2 lg:overflow-visible">
      {items.map((item, index) => (
        <ResponsiveImage
          key={item.id}
          media={item.media}
          locale={locale}
          sizes="(max-width:1024px) 82vw, 25vw"
          priority={index === 0}
          className="w-[82vw] shrink-0 snap-center overflow-hidden rounded-token bg-black/5 sm:w-[45vw] lg:w-auto"
          imgClassName="aspect-[3/4] h-full w-full object-cover"
        />
      ))}
    </div>
  );
}
