"use client";
import {
  ResponsiveImage,
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";

import Decimal from "decimal.js";
import {
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import type { EditorialLocale } from "@/modules/editorial/contracts";
import type { LookCommerce } from "@/modules/editorial/commerce";

function PieceList({
  compact,
  children,
}: {
  compact: boolean;
  children: ReactNode;
}) {
  return compact ? (
    <div className="editorial-piece-list">{children}</div>
  ) : (
    <>{children}</>
  );
}

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type PurchaseAction = (
  ids: string[],
) => Promise<{ ok: true } | { ok: false; message: string }>;

export function CuratedPurchase({
  pieces,
  locale,
  currency,
  action,
  fittingHref,
  compact = false,
  idPrefix = "look",
  imageByColor = {},
}: {
  pieces: LookCommerce["pieces"];
  locale: EditorialLocale;
  currency: string;
  action?: PurchaseAction;
  fittingHref?: string;
  compact?: boolean;
  idPrefix?: string;
  imageByColor?: Record<string, ResponsiveImageMedia>;
}) {
  const t = useTranslations("editorial");
  const shopping = useTranslations("shopping");
  const [selection, setSelection] = useState<
    Record<string, { color?: string; variant?: string }>
  >({});
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  }>();
  const [pending, start] = useTransition();
  const [mutationBusy, setMutationBusy] = useState(false);
  // Homepage Flight refresh can remain pending after the committed action resolves.
  // Keep its controls tied to the mutation; retain the legacy detail-page transition.
  const busy = compact ? mutationBusy : pending;
  const inFlight = useRef(false);
  const Heading = compact ? "h4" : "h2";
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
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
    if (!action || inFlight.current) return;
    inFlight.current = true;
    if (compact) {
      setMutationBusy(true);
      setFeedback(undefined);
    }
    start(async () => {
      try {
        const result = await action(ids);
        setFeedback({
          error: !result.ok,
          message: result.ok ? t("added") : result.message,
        });
      } finally {
        inFlight.current = false;
        if (compact) setMutationBusy(false);
      }
    });
  }
  return (
    <section
      className={`editorial-pieces${compact ? " home-look-pieces" : ""}`}
      aria-label={t("pieces")}
      aria-busy={busy}
    >
      <PieceList compact={compact}>
        {pieces.map((piece, index) => {
          const current = selection[piece.productId];
          const colors = [
            ...new Map(
              piece.variants.map((v) => [v.colorId, v.color]),
            ).entries(),
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
              id={`${idPrefix}-piece-${index + 1}`}
              data-product-id={piece.productId}
              key={piece.productId}
            >
              {imageByColor[`${piece.productId}:${color}`] && (
                <ResponsiveImage
                  media={imageByColor[`${piece.productId}:${color}`]}
                  locale={locale}
                  sizes="(max-width: 900px) 150px, 100px"
                  imgClassName="h-full w-full object-contain"
                />
              )}
              {compact &&
                isDemoFashionMedia(
                  imageByColor[`${piece.productId}:${color}`],
                ) && (
                  <small className="home-look-demo-note">
                    {shopping("demoImage")}
                  </small>
                )}
              <Heading>
                {piece.href ? (
                  <a href={piece.href}>{piece.title}</a>
                ) : (
                  t("unavailable")
                )}
              </Heading>
              <p>
                {amount === null
                  ? t("unavailable")
                  : selected
                    ? formatStorefrontAmount(amount, currency, locale)
                    : t("fromPrice", {
                        amount: formatStorefrontAmount(
                          amount,
                          currency,
                          locale,
                        ),
                      })}
              </p>
              {compact && colors.length === 1 ? (
                <span className="home-look-color">
                  <small>{t("color")}</small>
                  <strong>{colors[0][1]}</strong>
                </span>
              ) : (
                colors.length > 0 && (
                  <label
                    className={compact ? "home-look-color-select" : undefined}
                  >
                    {t("color")}
                    <select
                      className="input"
                      value={color}
                      disabled={!interactive || busy}
                      onChange={(event) => {
                        const colorId = event.currentTarget.value;
                        setSelection((current) => ({
                          ...current,
                          [piece.productId]: { color: colorId },
                        }));
                      }}
                    >
                      {colors.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              )}
              {available && (
                <label
                  className={compact ? "home-look-size-select" : undefined}
                >
                  {t("size")}
                  <select
                    className="input"
                    value={selected?.id ?? ""}
                    disabled={!interactive || busy}
                    onChange={(event) => {
                      const variant = event.currentTarget.value;
                      setSelection((current) => ({
                        ...current,
                        [piece.productId]: { color, variant },
                      }));
                    }}
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
                  disabled={busy || !selected}
                  onClick={() => selected && buy([selected.id])}
                >
                  {t("addPiece")}
                </button>
              )}
            </div>
          );
        })}
      </PieceList>
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
              busy || !chosen.length || chosen.length !== purchasable.length
            }
            onClick={() => buy(chosen.map((variant) => variant.id))}
          >
            {compact
              ? t(
                  purchasable.length < pieces.length
                    ? "addAvailableLook"
                    : "addWholeLook",
                )
              : t("addLook")}
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
