"use client";

import { useEffect, useState } from "react";

export function ProductPrice({
  initial,
  compare,
}: {
  initial: string;
  compare?: string;
}) {
  const [price, setPrice] = useState(initial);
  useEffect(() => {
    const update = (event: Event) =>
      setPrice((event as CustomEvent<string>).detail);
    window.addEventListener("catalog-price", update);
    return () => window.removeEventListener("catalog-price", update);
  }, []);
  return (
    <p
      className="mt-4 text-xl font-semibold"
      dir="ltr"
      data-testid="product-price"
    >
      {price}
      {compare && (
        <del className="ms-3 text-sm font-normal text-muted">{compare}</del>
      )}
    </p>
  );
}
