"use client";

import { useId, useState } from "react";
import Decimal from "decimal.js";
import Link from "next/link";
import { ResponsiveImage, isDemoFashionMedia } from "./responsive-image";
import { CommerceForm, type CommerceResult } from "./commerce-form";
import { formatCatalogCurrency } from "@/modules/catalog/format";
import type { PreparedLookView } from "@/modules/outfits/types";

export type StudioLabels = Record<
  | "eyebrow"
  | "chooseLook"
  | "pieces"
  | "size"
  | "chooseSize"
  | "unavailable"
  | "details"
  | "subtotal"
  | "addLook"
  | "chooseSizes"
  | "emptySelection"
  | "completeImage"
  | "demo"
  | "inBag",
  string
>;

export function ShopLookStudio({
  title,
  body,
  looks,
  locale,
  currency,
  labels,
  action,
}: {
  title: string;
  body: string;
  looks: PreparedLookView[];
  locale: "fa" | "tr" | "en";
  currency: "USD" | "TRY" | "CAD" | "IRT";
  labels: StudioLabels;
  action: (form: FormData) => Promise<CommerceResult>;
}) {
  const uid = useId();
  const [activeLook, setActiveLook] = useState(looks[0]?.id);
  const look = looks.find((item) => item.id === activeLook) ?? looks[0];
  if (!look) return null;
  return (
    <section
      className="look-studio"
      data-testid="shop-look-studio"
      dir={locale === "fa" ? "rtl" : "ltr"}
      aria-labelledby={`${uid}-title`}
    >
      <header className="look-heading">
        <div>
          <p className="shop-eyebrow">{labels.eyebrow}</p>
          <h2 id={`${uid}-title`}>{title}</h2>
        </div>
        <p>{body}</p>
      </header>
      <div className="look-tabs" role="group" aria-label={labels.chooseLook}>
        {looks.map((item, index) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={look.id === item.id}
            onClick={() => setActiveLook(item.id)}
          >
            <span aria-hidden="true">
              {new Intl.NumberFormat(locale, {
                minimumIntegerDigits: 2,
              }).format(index + 1)}
            </span>
            {item.label}
          </button>
        ))}
      </div>
      <LookSelection
        key={look.id}
        look={look}
        uid={uid}
        locale={locale}
        currency={currency}
        labels={labels}
        action={action}
      />
    </section>
  );
}

function LookSelection({
  look,
  uid,
  locale,
  currency,
  labels,
  action,
}: {
  look: PreparedLookView;
  uid: string;
  locale: "fa" | "tr" | "en";
  currency: "USD" | "TRY" | "CAD" | "IRT";
  labels: StudioLabels;
  action: (form: FormData) => Promise<CommerceResult>;
}) {
  const [focused, setFocused] = useState(look.items[0]?.productId);
  const [included, setIncluded] = useState(
    look.items.map((item) => item.productId),
  );
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);
  const selected = look.items.filter((item) =>
    included.includes(item.productId),
  );
  const variants = selected.map((item) =>
    item.variants.find(
      (variant) =>
        variant.id === sizes[item.productId] && variant.available > 0,
    ),
  );
  const ready = selected.length > 0 && variants.every(Boolean);
  const total = variants.reduce(
    (sum, variant) => (variant ? sum.add(variant.amount) : sum),
    new Decimal(0),
  );
  const format = (amount: string) =>
    formatCatalogCurrency(amount, currency, locale);
  return (
    <div className="look-layout">
      <div className="look-visual">
        <div className="look-scene">
          <div className="look-frames" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="look-model">
            <ResponsiveImage
              media={look.media}
              locale={locale}
              role="full"
              sizes="(min-width:1024px) 42vw, 78vw"
              className="look-model-image"
            />
          </div>
          {look.items.map((item, index) => (
            <button
              type="button"
              key={item.productId}
              className={`look-plane look-plane-${index + 1}`}
              data-active={focused === item.productId}
              onMouseEnter={() => setFocused(item.productId)}
              onFocus={() => setFocused(item.productId)}
              onClick={() => {
                setFocused(item.productId);
                document
                  .getElementById(`${uid}-${item.productId}-size`)
                  ?.focus();
              }}
              aria-label={`${labels.size}: ${item.title}`}
            >
              {item.media && (
                <ResponsiveImage
                  media={item.media}
                  locale={locale}
                  role="catalog"
                  sizes="(min-width:1024px) 12vw, 26vw"
                  className="look-piece-image"
                  imgClassName="h-full w-full object-contain"
                />
              )}
              <span className="look-plane-caption">
                <span>
                  {new Intl.NumberFormat(locale, {
                    minimumIntegerDigits: 2,
                  }).format(index + 1)}
                </span>
                <span>{item.title}</span>
                <span aria-hidden="true">↗</span>
              </span>
            </button>
          ))}
        </div>
        <p className="look-image-note">
          {isDemoFashionMedia(look.media) ? `${labels.demo} · ` : ""}
          {labels.completeImage}
        </p>
      </div>
      <div className="look-purchase">
        <div className="look-purchase-heading">
          <h3>{labels.pieces}</h3>
          <span>{new Intl.NumberFormat(locale).format(look.items.length)}</span>
        </div>
        <CommerceForm
          action={async (form) => {
            const result = await action(form);
            if (result.ok) setAdded(true);
            return result;
          }}
          className="look-form"
        >
          <input type="hidden" name="lookId" value={look.id} />
          {look.items.map((item, index) => {
            const picked = item.variants.find(
              (variant) => variant.id === sizes[item.productId],
            );
            const checked = included.includes(item.productId);
            return (
              <div
                className="look-item"
                key={item.productId}
                data-active={focused === item.productId}
                onFocus={() => setFocused(item.productId)}
              >
                <div className="look-item-title">
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setIncluded((all) =>
                          event.target.checked
                            ? [...all, item.productId]
                            : all.filter((id) => id !== item.productId),
                        );
                        setAdded(false);
                      }}
                    />
                    <span>
                      {new Intl.NumberFormat(locale, {
                        minimumIntegerDigits: 2,
                      }).format(index + 1)}{" "}
                      · {item.title}
                    </span>
                  </label>
                  <Link
                    href={item.href}
                    aria-label={`${labels.details}: ${item.title}`}
                  >
                    ↗
                  </Link>
                </div>
                <p className="look-color">
                  <span
                    style={{ background: item.colorHex }}
                    aria-hidden="true"
                  />
                  {item.colorName}
                </p>
                <div className="look-item-options">
                  <label htmlFor={`${uid}-${item.productId}-size`}>
                    {labels.size}
                  </label>
                  <select
                    id={`${uid}-${item.productId}-size`}
                    aria-label={`${labels.size}: ${item.title}`}
                    name={checked ? "variantId" : undefined}
                    value={sizes[item.productId] ?? ""}
                    disabled={
                      !checked ||
                      !item.variants.some((variant) => variant.available > 0)
                    }
                    required={checked}
                    onChange={(event) => {
                      setSizes((all) => ({
                        ...all,
                        [item.productId]: event.target.value,
                      }));
                      setAdded(false);
                    }}
                  >
                    <option value="">{labels.chooseSize}</option>
                    {item.variants.map((variant) => (
                      <option
                        value={variant.id}
                        key={variant.id}
                        disabled={variant.available <= 0}
                      >
                        {variant.size}
                        {variant.available <= 0
                          ? ` · ${labels.unavailable}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <span className="look-piece-price" dir="ltr">
                    {picked
                      ? format(picked.amount)
                      : item.variants[0]
                        ? format(item.variants[0].amount)
                        : "—"}
                  </span>
                </div>
                {!item.variants.some((variant) => variant.available > 0) && (
                  <p className="text-error">{labels.unavailable}</p>
                )}
              </div>
            );
          })}
          <div className="look-total" aria-live="polite">
            <span>{labels.subtotal}</span>
            <strong dir="ltr">{ready ? format(total.toString()) : "—"}</strong>
          </div>
          {!ready && (
            <p className="look-help">
              {selected.length ? labels.chooseSizes : labels.emptySelection}
            </p>
          )}
          <button
            className="button look-add"
            disabled={!ready || added}
            type="submit"
          >
            {added ? labels.inBag : labels.addLook}
            <span aria-hidden="true">↗</span>
          </button>
        </CommerceForm>
      </div>
    </div>
  );
}
