"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { FittingProduct } from "./fitting-room";

type Props = {
  product: FittingProduct;
  modelId: string;
  disabled: boolean;
  load: (productId: string, after?: string) => Promise<FittingProduct[]>;
  replace: (from: string, to: string) => void;
};

export function ReceiptVariant({
  product,
  modelId,
  disabled,
  load,
  replace,
}: Props) {
  const t = useTranslations("instantFitting");
  const formId = useId();
  const [items, setItems] = useState<FittingProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<{
    from: string;
    color: string;
    size: string;
  }>();
  const ready = (v: FittingProduct) =>
    v.available &&
    v.amount !== null &&
    v.placements?.some((p) => p.model.id === modelId);
  const colorOf = (v: FittingProduct) => v.colorId ?? v.color;
  const sizeOf = (v: FittingProduct) => v.sizeId ?? v.size;
  const options = [
    ...new Map([...items, product].map((v) => [v.variantId, v])).values(),
  ];
  const current =
    draft?.from === product.variantId
      ? draft
      : {
          from: product.variantId,
          color: colorOf(product),
          size: sizeOf(product),
        };
  const colors = [...new Map(options.map((v) => [colorOf(v), v.color]))];
  const sizes = options.filter((v) => colorOf(v) === current.color);
  const candidate = sizes.find((v) => sizeOf(v) === current.size);
  const canApply =
    candidate && candidate.variantId !== product.variantId && ready(candidate);
  async function fetchPage(after?: string) {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const next = await load(product.productId, after);
      setItems((old) => (after ? [...old, ...next] : next));
      setCursor(next[0]?.nextCursor ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      className="moda-fr31-row-options"
      onToggle={(event) => {
        if (event.currentTarget.open && cursor === undefined && !failed)
          void fetchPage();
      }}
    >
      <summary>
        {product.color} · <bdi>{product.size}</bdi>
        <span className="sr-only"> — {t("receiptEditVariant")}</span>
      </summary>
      <div className="moda-fr31-row-edit">
        <label htmlFor={formId + "-color"}>
          {t("receiptColor")}
          <select
            id={formId + "-color"}
            value={current.color}
            disabled={disabled || loading}
            onChange={(event) => {
              const color = event.target.value;
              const sameSize = options.some(
                (v) =>
                  colorOf(v) === color &&
                  sizeOf(v) === current.size &&
                  ready(v),
              );
              setDraft({
                ...current,
                color,
                size: sameSize ? current.size : "",
              });
            }}
          >
            {colors.map(([id, label]) => (
              <option
                key={id}
                value={id}
                disabled={
                  id !== current.color &&
                  !options.some((v) => colorOf(v) === id && ready(v))
                }
              >
                {label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={formId + "-size"}>
          {t("receiptSize")}
          <select
            id={formId + "-size"}
            value={current.size}
            disabled={disabled || loading}
            onChange={(event) =>
              setDraft({ ...current, size: event.target.value })
            }
          >
            <option value="" disabled>
              {t("receiptChooseSize")}
            </option>
            {sizes.map((v) => (
              <option key={v.variantId} value={sizeOf(v)} disabled={!ready(v)}>
                {v.size}
                {!ready(v) ? " · " + t("unavailable") : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || loading || !canApply}
          onClick={() =>
            candidate && replace(product.variantId, candidate.variantId)
          }
        >
          {t("receiptApplyVariant")}
        </button>
        {(cursor || failed) && (
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => void fetchPage(cursor ?? undefined)}
          >
            {t(failed ? "receiptRetryOptions" : "moreVariants")}
          </button>
        )}
        {failed && <p role="alert">{t("error")}</p>}
      </div>
    </details>
  );
}
