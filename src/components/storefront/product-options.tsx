"use client";
import { useMemo, useState } from "react";

type Variant = {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  isActive: boolean;
  color: { hex: string; name: string };
  size: { value: string };
};
export function ProductOptions({
  variants,
  labels,
}: {
  variants: Variant[];
  labels: { color: string; size: string; add: string; stub: string };
}) {
  const colors = useMemo(
    () => [...new Map(variants.map((v) => [v.colorId, v.color])).entries()],
    [variants],
  );
  const [color, setColor] = useState(
    variants.find((item) => item.isActive)?.colorId ?? colors[0]?.[0] ?? "",
  );
  const available = variants.filter((v) => v.colorId === color);
  const [size, setSize] = useState(
    available.find((item) => item.isActive)?.sizeId ?? "",
  );
  return (
    <div className="grid gap-5">
      <fieldset>
        <legend className="mb-2 font-medium">{labels.color}</legend>
        <div className="flex flex-wrap gap-2">
          {colors.map(([id, item]) => (
            <button
              key={id}
              type="button"
              title={item.name}
              aria-pressed={id === color}
              onClick={() => {
                setColor(id);
                window.dispatchEvent(
                  new CustomEvent("catalog-color", { detail: id }),
                );
                setSize(
                  variants.find((v) => v.colorId === id && v.isActive)
                    ?.sizeId ?? "",
                );
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
              disabled={!v.isActive}
              aria-pressed={v.sizeId === size}
              onClick={() => setSize(v.sizeId)}
              className="min-h-11 min-w-12 rounded-[8px] border px-3 disabled:cursor-not-allowed disabled:opacity-35 aria-pressed:bg-text aria-pressed:text-bg"
            >
              {v.size.value}
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className="button w-full"
        onClick={() => alert(labels.stub)}
        disabled={!size}
      >
        {labels.add}
      </button>
    </div>
  );
}
