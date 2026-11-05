"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CUTOUT_SLOTS } from "@/modules/catalog/cutouts/contracts";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { INSTANT_COMPOSITION_CAPACITY } from "@/modules/fitting/instant-contract";
import type { FittingProduct } from "./fitting-room";
import { ResponsiveImage } from "./responsive-image";

type Slot = (typeof CUTOUT_SLOTS)[number];
type Request = {
  query?: string;
  slot?: Slot;
  productId?: string;
  after?: string;
  afterProduct?: string;
};
type Props = {
  initial: FittingProduct[];
  catalog: FittingProduct[];
  locale: "fa" | "tr" | "en";
  currency: "IRT" | "TRY" | "CAD";
  modelId: string;
  ids: string[];
  disabled: boolean;
  load: (
    request: Request,
    onSuccess: (items: FittingProduct[]) => void,
  ) => void;
  choose: (id: string) => void;
  remove: (id: string) => void;
};

const displayOrder = [
  "TOP",
  "LAYER",
  "ONE_PIECE",
  "BOTTOM",
  "SHOES",
  "ACCESSORY",
];
function productIds(items: FittingProduct[]) {
  const slots = new Map(items.map((item) => [item.productId, item.slot]));
  const rank = (id: string) => {
    const index = displayOrder.indexOf(slots.get(id) ?? "");
    return index < 0 ? displayOrder.length : index;
  };
  return [...slots.keys()].sort((a, b) => rank(a) - rank(b));
}
const variantCursors = (items: FittingProduct[]) =>
  Object.fromEntries(
    items.map((item) => [item.productId, item.nextCursor ?? null]),
  );

export function InstantFittingGallery({
  initial,
  catalog,
  locale,
  currency,
  modelId,
  ids,
  disabled,
  load,
  choose,
  remove,
}: Props) {
  const t = useTranslations("instantFitting");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [slot, setSlot] = useState<Slot>();
  const [onlyReady, setOnlyReady] = useState(true);
  const [products, setProducts] = useState(() => productIds(initial));
  const [cursor, setCursor] = useState(initial[0]?.nextProductCursor ?? null);
  const [cursors, setCursors] = useState(() => variantCursors(initial));
  const grouped = new Map<string, FittingProduct[]>();
  for (const item of catalog) {
    const group = grouped.get(item.productId) ?? [];
    group.push(item);
    grouped.set(item.productId, group);
  }
  // Restored variants can belong to products beyond the loaded catalog pages.
  const restored = !submitted
    ? productIds(
        catalog.filter(
          (item) =>
            ids.includes(item.variantId) && (!slot || item.slot === slot),
        ),
      )
    : [];
  const visible = [...new Set([...products, ...restored])].filter((id) =>
    grouped
      .get(id)
      ?.some(
        (item) =>
          ids.includes(item.variantId) ||
          !onlyReady ||
          item.placements?.some((layer) => layer.model.id === modelId),
      ),
  );

  function fetchPage(
    nextQuery: string,
    nextSlot?: Slot,
    afterProduct?: string,
  ) {
    if (disabled) return;
    load({ query: nextQuery, slot: nextSlot, afterProduct }, (items) => {
      const page = productIds(items);
      setProducts((old) =>
        afterProduct ? [...new Set([...old, ...page])] : page,
      );
      setCursors((old) => ({ ...old, ...variantCursors(items) }));
      setCursor(items[0]?.nextProductCursor ?? null);
      setSlot(nextSlot);
      setSubmitted(nextQuery);
    });
  }

  return (
    <section className="moda-fr3-gallery" aria-label={t("galleryTitle")}>
      <div className="moda-fr3-heading">
        <h2>{t("galleryTitle")}</h2>
        <bdi data-testid="instant-gallery-count" aria-live="polite">
          {t("galleryCount", {
            count: ids.length,
            capacity: INSTANT_COMPOSITION_CAPACITY,
          })}
        </bdi>
      </div>
      <div
        className="moda-fr3-filters"
        role="group"
        aria-label={t("galleryFilters")}
      >
        {([undefined, ...CUTOUT_SLOTS] as const).map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            data-fitting-filter={value ?? "all"}
            aria-pressed={slot === value}
            disabled={disabled}
            onClick={() => {
              if (slot !== value) fetchPage(submitted, value);
            }}
          >
            {t(value ? `slot_${value}` : "galleryAll")}
          </button>
        ))}
      </div>
      <div className="moda-fr3-tools">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            fetchPage(query.trim(), slot);
          }}
        >
          <label className="sr-only" htmlFor="instant-gallery-query">
            {t("search")}
          </label>
          <input
            id="instant-gallery-query"
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder={t("search")}
          />
          <button type="submit" disabled={disabled}>
            {t("search")}
          </button>
        </form>
        <label className="moda-instant-ready">
          <input
            type="checkbox"
            checked={onlyReady}
            onChange={(event) => setOnlyReady(event.target.checked)}
          />
          {t("onlyCompatible")}
        </label>
      </div>
      <div className="moda-instant-grid" data-moda4="tryon-grid">
        {visible.map((productId) => {
          const variants = grouped.get(productId)!;
          const after = cursors[productId];
          return (
            <GalleryCard
              key={`${productId}:${modelId}`}
              variants={variants}
              locale={locale}
              currency={currency}
              modelId={modelId}
              ids={ids}
              disabled={disabled}
              choose={choose}
              remove={remove}
              more={
                after !== null
                  ? () => {
                      load({ productId, after }, (items) => {
                        setCursors((old) => ({
                          ...old,
                          [productId]: items[0]?.nextCursor ?? null,
                        }));
                      });
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      {!visible.length && (
        <p role="status" className="moda-fr3-empty">
          {t("empty")}
        </p>
      )}
      {cursor && (
        <button
          type="button"
          className="moda-fr3-more"
          disabled={disabled}
          onClick={() => fetchPage(submitted, slot, cursor)}
        >
          {t("moreProducts")}
        </button>
      )}
    </section>
  );
}

function GalleryCard({
  variants,
  locale,
  currency,
  modelId,
  ids,
  disabled,
  choose,
  remove,
  more,
}: Pick<
  Props,
  "locale" | "currency" | "modelId" | "ids" | "disabled" | "choose" | "remove"
> & {
  variants: FittingProduct[];
  more?: () => void;
}) {
  const t = useTranslations("instantFitting");
  const description = useId();
  const [draft, setDraft] = useState<{ id: string; selection?: string }>();
  const placementFor = (item: FittingProduct) =>
    item.placements?.find((p) => p.model.id === modelId);
  const ready = (item: FittingProduct) =>
    item.available && item.amount !== null && Boolean(placementFor(item));
  const selected = variants.find((item) => ids.includes(item.variantId));
  const proposed =
    draft && draft.selection === selected?.variantId
      ? variants.find((item) => item.variantId === draft.id)
      : undefined;
  const current = selected ?? proposed ?? variants.find(ready) ?? variants[0];
  const candidate = proposed ?? current;
  const placement = placementFor(current);
  const slot = CUTOUT_SLOTS.find(
    (value) => value === (placement?.slot ?? current.slot),
  );
  const statusFor = (item: FittingProduct) =>
    !item.available
      ? t("unavailable")
      : item.amount === null
        ? t("galleryPriceUnavailable")
        : !placementFor(item)
          ? t("galleryIncompatible")
          : null;
  const status = statusFor(current);
  const group = placement?.anchor
    ? t(`anchor_${placement.anchor}`)
    : slot
      ? t(`slot_${slot}`)
      : null;
  return (
    <article
      className="moda-instant-product moda-fr3-card"
      data-product-id={current.productId}
      data-fitting-variant={current.variantId}
      data-fitting-slot={slot}
    >
      <button
        type="button"
        className="moda-instant-pick"
        data-moda4={placement ? "tryon-item" : undefined}
        aria-pressed={Boolean(selected)}
        aria-label={t("try")}
        aria-describedby={description}
        aria-disabled={
          disabled ||
          (candidate.variantId !== selected?.variantId && !ready(candidate))
        }
        onClick={() => {
          if (disabled) return;
          if (selected && selected.variantId === candidate.variantId)
            remove(selected.variantId);
          else if (ready(candidate)) choose(candidate.variantId);
        }}
      >
        {group && <em>{group}</em>}
        <span className="moda-fr3-image">
          <ResponsiveImage
            media={
              placement?.media ?? {
                url: current.url,
                width: null,
                height: null,
                variants: {},
                blurDataUrl: null,
                altI18n: { [locale]: current.title },
              }
            }
            locale={locale}
            sizes="(max-width: 760px) 120px, 160px"
            imgClassName="moda-fr3-contained"
          />
        </span>
        <span className="moda-fr3-title" id={description}>
          {current.title}
        </span>
        <bdi>
          {current.amount !== null
            ? formatStorefrontAmount(current.amount, currency, locale)
            : t("galleryPriceUnavailable")}
        </bdi>
      </button>
      {status && <p className="moda-fr3-status">{status}</p>}
      <details className="moda-instant-variant">
        <summary>
          {current.color} · {current.size}
        </summary>
        <label>
          <span className="sr-only">{t("variant")}</span>
          <select
            className="input"
            aria-label={t("variant")}
            disabled={disabled}
            value={candidate.variantId}
            onChange={(event) =>
              setDraft({
                id: event.target.value,
                selection: selected?.variantId,
              })
            }
          >
            {variants.map((item) => (
              <option
                key={item.variantId}
                value={item.variantId}
                disabled={!ready(item)}
              >
                {item.color} · {item.size}
                {statusFor(item) ? ` · ${statusFor(item)}` : ""}
              </option>
            ))}
          </select>
        </label>
        {selected && proposed && selected.variantId !== proposed.variantId && (
          <p className="moda-fr3-status">{t("galleryApplyVariant")}</p>
        )}
        {more && (
          <button type="button" disabled={disabled} onClick={more}>
            {t("moreVariants")}
          </button>
        )}
      </details>
    </article>
  );
}
