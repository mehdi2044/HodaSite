"use client";

import Decimal from "decimal.js";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import type { EditorialLocale } from "@/modules/editorial/contracts";
import type { LookCommerce } from "@/modules/editorial/commerce";

type PurchaseAction = (
  ids: string[],
) => Promise<{ ok: true } | { ok: false; message: string }>;

export function CuratedPurchase({
  pieces,
  locale,
  currency,
  action,
  fittingHref,
}: {
  pieces: LookCommerce["pieces"];
  locale: EditorialLocale;
  currency: string;
  action?: PurchaseAction;
  fittingHref?: string;
}) {
  const t = useTranslations("editorial");
  const [selection, setSelection] = useState<
    Record<string, { color?: string; variant?: string }>
  >({});
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  }>();
  const [pending, start] = useTransition();
  const purchasable = pieces.filter((piece) =>
    piece.variants.some((v) => v.available > 0 && v.amount !== null),
  );
  const chosen = purchasable.flatMap((piece) => {
    const selected = piece.variants.find(
      (v) =>
        v.id === selection[piece.productId]?.variant &&
        v.available > 0 &&
        v.amount !== null,
    );
    return selected ? [selected] : [];
  });
  const total = chosen.reduce(
    (sum, variant) => sum.plus(variant.amount!),
    new Decimal(0),
  );
  function buy(ids: string[]) {
    if (!action) return;
    start(async () => {
      const result = await action(ids);
      setFeedback({
        error: !result.ok,
        message: result.ok ? t("added") : result.message,
      });
    });
  }
  return (
    <section className="editorial-pieces" aria-label={t("pieces")}>
      {pieces.map((piece, index) => {
        const current = selection[piece.productId];
        const colors = [
          ...new Map(piece.variants.map((v) => [v.colorId, v.color])).entries(),
        ];
        const color =
          current?.color ??
          piece.variants.find((v) => v.id === piece.variantId)?.colorId ??
          colors[0]?.[0];
        const sizes = piece.variants.filter((v) => v.colorId === color);
        const selected = sizes.find(
          (v) =>
            v.id === current?.variant && v.available > 0 && v.amount !== null,
        );
        const available = piece.variants.some(
          (v) => v.available > 0 && v.amount !== null,
        );
        const priceable = sizes.filter(
          (v) => v.available > 0 && v.amount !== null,
        );
        const amount =
          selected?.amount ??
          (priceable.length
            ? Decimal.min(...priceable.map((v) => v.amount!)).toFixed()
            : null);
        return (
          <div
            className="editorial-piece"
            id={`look-piece-${index + 1}`}
            key={piece.productId}
          >
            <h2>
              {piece.href ? (
                <a href={piece.href}>{piece.title}</a>
              ) : (
                t("unavailable")
              )}
            </h2>
            <p>
              {amount === null
                ? t("unavailable")
                : selected
                  ? formatStorefrontAmount(amount, currency, locale)
                  : t("fromPrice", {
                      amount: formatStorefrontAmount(amount, currency, locale),
                    })}
            </p>
            {colors.length > 0 && (
              <label>
                {t("color")}
                <select
                  className="input"
                  value={color}
                  onChange={(event) =>
                    setSelection({
                      ...selection,
                      [piece.productId]: { color: event.target.value },
                    })
                  }
                >
                  {colors.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {available && (
              <label>
                {t("size")}
                <select
                  className="input"
                  value={selected?.id ?? ""}
                  onChange={(event) =>
                    setSelection({
                      ...selection,
                      [piece.productId]: { color, variant: event.target.value },
                    })
                  }
                >
                  <option value="">{t("chooseSize")}</option>
                  {sizes.map((v) => (
                    <option
                      key={v.id}
                      value={v.id}
                      disabled={v.available <= 0 || v.amount === null}
                    >
                      {v.size}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {action && (
              <button
                className="button"
                disabled={pending || !selected}
                onClick={() => selected && buy([selected.id])}
              >
                {t("addPiece")}
              </button>
            )}
          </div>
        );
      })}
      <div className="editorial-total">
        <p>
          {t("total")}{" "}
          <bdi>
            {chosen.length
              ? formatStorefrontAmount(total, currency, locale)
              : t("chooseSize")}
          </bdi>
        </p>
        {action && (
          <button
            className="button"
            disabled={
              pending || !chosen.length || chosen.length !== purchasable.length
            }
            onClick={() => buy(chosen.map((variant) => variant.id))}
          >
            {t("addLook")}
          </button>
        )}
        {fittingHref && (
          <a
            className="button"
            href={
              fittingHref +
              (chosen.length
                ? "&" +
                  new URLSearchParams({
                    variants: chosen.map((variant) => variant.id).join(","),
                  })
                : "")
            }
          >
            {t("tryLook")}
          </a>
        )}
        {feedback && (
          <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>
        )}
      </div>
    </section>
  );
}
