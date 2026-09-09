"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function CatalogFilter({
  labels,
  options,
}: {
  labels: {
    filters: string;
    brand: string;
    color: string;
    size: string;
    material: string;
    minPrice: string;
    maxPrice: string;
    available: string;
    sort: string;
    apply: string;
    all: string;
  };
  options: {
    brands: Array<{ id: string; label: string }>;
    colors: Array<{ id: string; label: string }>;
    sizes: Array<{ id: string; label: string }>;
    materials: string[];
  };
}) {
  const router = useRouter();
  const current = useSearchParams();
  function submit(data: FormData) {
    const params = new URLSearchParams(current.toString());
    for (const key of [
      "brand",
      "color",
      "size",
      "material",
      "min",
      "max",
      "available",
      "sort",
    ]) {
      const value = String(data.get(key) || "");
      value ? params.set(key, value) : params.delete(key);
    }
    params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
  }
  return (
    <form
      action={submit}
      className="grid gap-3 rounded-token border border-black/5 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
      aria-label={labels.filters}
    >
      <Filter
        name="brand"
        label={labels.brand}
        all={labels.all}
        items={options.brands}
        initial={current.get("brand") ?? ""}
      />
      <Filter
        name="color"
        label={labels.color}
        all={labels.all}
        items={options.colors}
        initial={current.get("color") ?? ""}
      />
      <Filter
        name="size"
        label={labels.size}
        all={labels.all}
        items={options.sizes}
        initial={current.get("size") ?? ""}
      />
      <Filter
        name="material"
        label={labels.material}
        all={labels.all}
        items={options.materials.map((item) => ({ id: item, label: item }))}
        initial={current.get("material") ?? ""}
      />
      <label>
        {labels.sort}
        <select
          name="sort"
          defaultValue={current.get("sort") ?? "newest"}
          className="mt-1 h-11 w-full rounded-[8px] border border-black/10 px-2"
        >
          <option value="newest">{labels.sort}</option>
          <option value="price-asc">↑</option>
          <option value="price-desc">↓</option>
        </select>
      </label>
      <label>
        {labels.minPrice}
        <input
          className="mt-1 h-11 w-full rounded-[8px] border border-black/10 px-2"
          name="min"
          inputMode="decimal"
          defaultValue={current.get("min") ?? ""}
        />
      </label>
      <label>
        {labels.maxPrice}
        <input
          className="mt-1 h-11 w-full rounded-[8px] border border-black/10 px-2"
          name="max"
          inputMode="decimal"
          defaultValue={current.get("max") ?? ""}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 self-end">
        <input
          type="checkbox"
          name="available"
          value="1"
          defaultChecked={current.get("available") === "1"}
        />
        {labels.available}
      </label>
      <button className="button self-end" type="submit">
        {labels.apply}
      </button>
    </form>
  );
}
function Filter({
  name,
  label,
  all,
  items,
  initial,
}: {
  name: string;
  label: string;
  all: string;
  items: Array<{ id: string; label: string }>;
  initial: string;
}) {
  return (
    <label>
      {label}
      <select
        name={name}
        defaultValue={initial}
        className="mt-1 h-11 w-full rounded-[8px] border border-black/10 px-2"
      >
        <option value="">{all}</option>
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
    </label>
  );
}
