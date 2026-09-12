"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { CommerceForm } from "./commerce-form";
import { updateCartAction } from "@/app/[locale]/commerce-actions";

type Variant = {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  isActive: boolean;
  available: number;
  lowStockThreshold: number;
  price: string;
  color: { hex: string; name: string };
  size: { value: string };
};
export function ProductOptions({
  variants,
  labels,
  basePrice,
}: {
  variants: Variant[];
  labels: {
    color: string;
    size: string;
    add: string;
    stub: string;
    inStock: string;
    lowStock: string;
    outOfStock: string;
  };
  basePrice: string;
}) {
  const locale = useLocale();
  const colors = useMemo(
    () => [...new Map(variants.map((v) => [v.colorId, v.color])).entries()],
    [variants],
  );
  const [color, setColor] = useState(
    variants.find((item) => item.isActive && item.available > 0)?.colorId ??
      colors[0]?.[0] ??
      "",
  );
  const available = variants.filter((v) => v.colorId === color);
  const [size, setSize] = useState(
    available.find((item) => item.isActive && item.available > 0)?.sizeId ?? "",
  );
  const selected = variants.find(
    (variant) => variant.colorId === color && variant.sizeId === size,
  );
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("catalog-color", { detail: color }));
  }, [color]);
  const announcePrice = (variant?: Variant) =>
    window.dispatchEvent(
      new CustomEvent("catalog-price", {
        detail: variant?.price ?? basePrice,
      }),
    );
  return (
    <div className="grid gap-5">
      <fieldset>
        <legend className="mb-2 font-medium">
          {labels.color}
          <span className="ms-2 font-normal text-muted">
            {colors.find(([id]) => id === color)?.[1].name}
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {colors.map(([id, item]) => (
            <button
              key={id}
              type="button"
              title={item.name}
              aria-pressed={id === color}
              onClick={() => {
                const next = variants.find(
                  (v) => v.colorId === id && v.isActive && v.available > 0,
                );
                setColor(id);
                window.dispatchEvent(
                  new CustomEvent("catalog-color", { detail: id }),
                );
                setSize(next?.sizeId ?? "");
                announcePrice(next);
              }}
              className="h-11 w-11 rounded-full border-2 p-1 aria-pressed:border-text"
            >
              <span
                className="block h-full rounded-full"
                style={{ background: item.hex }}
              />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-medium">{labels.size}</legend>
        <div className="flex flex-wrap gap-2">
          {available.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={!v.isActive || v.available <= 0}
              aria-pressed={v.sizeId === size}
              onClick={() => {
                setSize(v.sizeId);
                announcePrice(v);
              }}
              className="min-h-11 min-w-12 rounded-[8px] border px-3 disabled:cursor-not-allowed disabled:opacity-35 aria-pressed:bg-text aria-pressed:text-bg"
            >
              {v.size.value}
            </button>
          ))}
        </div>
      </fieldset>
      <p
        className="shop-stock-status text-sm font-medium"
        role="status"
        data-testid="stock-status"
      >
        {!selected || selected.available <= 0
          ? labels.outOfStock
          : selected.available <= selected.lowStockThreshold
            ? labels.lowStock
            : labels.inStock}
      </p>
      <CommerceForm
        action={updateCartAction.bind(null, locale)}
        className="shop-product-submit grid gap-4"
      >
        <input type="hidden" name="variantId" value={selected?.id ?? ""} />
        <input type="hidden" name="quantity" value="1" />
        <input type="hidden" name="mode" value="add" />
        <button
          className="shop-add-button button w-full"
          disabled={!selected || !selected.isActive || selected.available <= 0}
        >
          {labels.add}
        </button>
      </CommerceForm>
    </div>
  );
}
