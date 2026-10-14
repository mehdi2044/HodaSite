"use client";

import { useEffect, useState } from "react";

export function ProductPrice({
  initial,
  compare,
  saleLabel,
}: {
  initial: string;
  compare?: string;
  saleLabel?: string;
}) {
  const [display, setDisplay] = useState({ price: initial, compare });
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (
        event as CustomEvent<string | { price: string; compare?: string }>
      ).detail;
      setDisplay(
        typeof detail === "string"
          ? { price: detail, compare: undefined }
          : detail,
      );
    };
    window.addEventListener("catalog-price", update);
    return () => window.removeEventListener("catalog-price", update);
  }, []);
  return (
    <p
      className="mt-4 text-xl font-semibold"
      dir="ltr"
      data-testid="product-price"
    >
      {display.price}
      {display.compare && (
        <del className="ms-3 text-sm font-normal text-muted">
          {display.compare}
        </del>
      )}
      {display.compare && saleLabel && (
        <span className="ms-3 text-sm">{saleLabel}</span>
      )}
    </p>
  );
}
