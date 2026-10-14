"use client";

import {
  CATALOG_FACET_KEYS,
  withoutListingFacet,
} from "@/modules/catalog/listing-query";
import { ShopSheet } from "./sheet";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("shopping");
  const router = useRouter();
  const current = useSearchParams();
  function submit(data: FormData) {
    const params = new URLSearchParams(current.toString());
    for (const key of CATALOG_FACET_KEYS) {
      const value = String(data.get(key) || "");
      value ? params.set(key, value) : params.delete(key);
    }
    params.delete("page");
    params.delete("after");
    router.push(`?${params.toString()}`, { scroll: false });
  }
  const choices: Record<string, { id: string; label: string }[]> = {
    brand: options.brands,
    color: options.colors,
    size: options.sizes,
    material: options.materials.map((value) => ({ id: value, label: value })),
  };
  const active = CATALOG_FACET_KEYS.filter(
    (key) =>
      current.has(key) &&
      current.get(key) !== "" &&
      (key !== "sort" || current.get(key) !== "newest"),
  );
  const remove = (key?: string) =>
    router.push(
      `?${withoutListingFacet(new URLSearchParams(current.toString()), key)}`,
      { scroll: false },
    );
  return (
    <div className="moda-catalog-toolbar">
      <div
        className="moda-size-shortcuts"
        role="group"
        aria-label={labels.size}
      >
        {options.sizes.slice(0, 8).map((size) => (
          <button
            key={size.id}
            type="button"
            className="button button-outline"
            aria-pressed={current.get("size") === size.id}
            onClick={() => {
              const next = withoutListingFacet(
                new URLSearchParams(current.toString()),
                "size",
              );
              if (current.get("size") !== size.id) next.set("size", size.id);
              router.push(`?${next}`, { scroll: false });
            }}
          >
            {size.label}
          </button>
        ))}
      </div>
      <ShopSheet title={labels.filters}>
        <form
          key={current.toString()}
          action={submit}
          className="shop-filter-form"
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
              <option value="newest">{t("newest")}</option>
              <option value="price-asc">{t("priceAsc")}</option>
              <option value="price-desc">{t("priceDesc")}</option>
              <option value="name">{t("sortName")}</option>
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
          <button
            type="button"
            className="shop-reset"
            onClick={() => {
              remove();
            }}
          >
            {t("reset")}
          </button>
        </form>
      </ShopSheet>
      {active.length > 0 && (
        <div
          className="moda-active-filters"
          role="group"
          aria-label={t("activeFilters")}
        >
          {active.map((key) => {
            const label =
              key === "min"
                ? labels.minPrice
                : key === "max"
                  ? labels.maxPrice
                  : key === "available"
                    ? labels.available
                    : labels[
                        key as "brand" | "color" | "size" | "material" | "sort"
                      ];
            const value =
              choices[key]?.find((item) => item.id === current.get(key))
                ?.label ??
              (key === "sort"
                ? t(
                    current.get(key) === "price-asc"
                      ? "priceAsc"
                      : current.get(key) === "price-desc"
                        ? "priceDesc"
                        : current.get("sort") === "name"
                          ? "sortName"
                          : "newest",
                  )
                : key === "available"
                  ? ""
                  : current.get(key));
            return (
              <button
                key={key}
                type="button"
                className="moda-filter-chip"
                aria-label={t("removeFilter", { filter: `${label} ${value}` })}
                onClick={() => remove(key)}
              >
                {label} {value}
                <span aria-hidden="true">×</span>
              </button>
            );
          })}
          <button
            type="button"
            className="moda-filter-chip"
            onClick={() => remove()}
          >
            {t("reset")}
          </button>
        </div>
      )}
    </div>
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
