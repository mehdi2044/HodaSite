"use client";

import Decimal from "decimal.js";
import { useId, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import type { LookCommerce } from "@/modules/editorial/commerce";
import type {
  EditorialLocale,
  LookContent,
} from "@/modules/editorial/contracts";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";

type Variant = LookCommerce["pieces"][number]["variants"][number];
type Piece = {
  productId: string;
  title: string;
  href: string;
  role?: "MAIN" | "SUGGESTED";
  reference: Variant;
  variants: Variant[];
  image?: ResponsiveImageMedia;
};
type CartAction = (
  ids: string[],
) => Promise<{ ok: true } | { ok: false; message: string }>;
const subscribeToHydration = () => () => {};
const hydrated = () => true;
const onServer = () => false;
const isPurchasable = (variant: Variant) =>
  variant.available > 0 && variant.amount !== null;

export function LivingRailDisplay({
  artwork,
  portrait,
  settings,
  title,
  pieces,
  weekly,
  locale,
  currency,
  demo,
  lookHref,
  fittingHref,
  articleHref,
  action,
}: {
  artwork: ResponsiveImageMedia;
  portrait?: ResponsiveImageMedia;
  settings: NonNullable<LookContent["livingRail"]>;
  title: string;
  pieces: Piece[];
  weekly: boolean;
  locale: EditorialLocale;
  currency: string;
  demo: boolean;
  lookHref?: string;
  fittingHref?: string;
  articleHref?: string;
  action?: CartAction;
}) {
  const t = useTranslations("editorial");
  const rail = useTranslations("livingRail");
  const titleId = useId();
  const [activeId, setActiveId] = useState(pieces[0]?.productId);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [replay, setReplay] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [pending, start] = useTransition();
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    hydrated,
    onServer,
  );
  const getVariant = (piece: Piece) =>
    piece.variants.find(({ id }) => id === sizes[piece.productId]) ??
    piece.reference;
  const active =
    pieces.find(({ productId }) => productId === activeId) ?? pieces[0];
  const variant = active && getVariant(active);
  const chosen = pieces.flatMap((piece) => {
    const choice = getVariant(piece);
    return selected.includes(piece.productId) && isPurchasable(choice)
      ? [choice]
      : [];
  });
  const total = chosen.reduce(
    (sum, choice) => sum.plus(choice.amount!),
    new Decimal(0),
  );
  const money = (amount: string | Decimal) =>
    formatStorefrontAmount(amount, currency, locale);
  const Title = weekly ? "h2" : "h1";
  const rack = settings.layout === "RACK";

  function buy() {
    if (!action || !chosen.length) return;
    setFeedback("");
    start(async () => {
      const result = await action(chosen.map(({ id }) => id));
      setFeedback(result.ok ? t("added") : result.message);
    });
  }

  function toggle(productId: string, checked: boolean) {
    setSelected((previous) =>
      checked
        ? [...previous, productId]
        : previous.filter((id) => id !== productId),
    );
    setFeedback("");
  }

  return (
    <article
      className="living-rail"
      aria-labelledby={titleId}
      data-layout={settings.layout.toLowerCase()}
      data-free-side={settings.freeSide.toLowerCase()}
      data-motion={settings.motion}
      data-replay={replay ? 1 + (replay % 2) : 0}
    >
      <div className="living-rail-stage">
        <div className="living-rail-photo">
          <ResponsiveImage
            media={artwork}
            locale={locale}
            priority={!weekly}
            sizes="(max-width: 800px) 100vw, 760px"
            mobile={
              portrait
                ? { media: portrait, query: "(max-width: 520px)" }
                : undefined
            }
          />
          {demo && (
            <span className="living-rail-disclosure">{rail("demo")}</span>
          )}
        </div>
        <div className="living-rail-collection">
          <div
            className="living-rail-track"
            role="group"
            aria-label={rail("pieces")}
          >
            {pieces.map((piece) => (
              <button
                type="button"
                key={piece.productId}
                className="living-rail-card"
                aria-label={piece.title}
                aria-description={
                  selected.includes(piece.productId)
                    ? rail("selected")
                    : undefined
                }
                aria-pressed={piece.productId === active?.productId}
                disabled={!interactive}
                onClick={() => setActiveId(piece.productId)}
              >
                <span className="living-rail-card-image">
                  {piece.image ? (
                    <ResponsiveImage
                      media={piece.image}
                      locale={locale}
                      sizes="136px"
                    />
                  ) : (
                    <span>{rail("noImage")}</span>
                  )}
                </span>
                <span className="living-rail-card-name">{piece.title}</span>
                {selected.includes(piece.productId) && (
                  <span
                    className="living-rail-selected"
                    aria-label={rail("selected")}
                  >
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          {rack && settings.motion && (
            <button
              type="button"
              className="living-rail-replay"
              disabled={!interactive}
              onClick={() => setReplay((value) => value + 1)}
            >
              <span aria-hidden="true">↻</span> {rail("replay")}
            </button>
          )}
        </div>
      </div>
      <div className="living-rail-info">
        <header className="living-rail-heading">
          <p>{rail("name")}</p>
          <Title id={titleId}>{title}</Title>
          <span>
            {weekly ? t("weekly") : t("gallery")} ·{" "}
            {rail("pieceCount", { count: pieces.length })}
          </span>
        </header>
        {active && variant && (
          <div className="living-rail-piece">
            <div className="living-rail-piece-image">
              {active.image && (
                <ResponsiveImage
                  media={active.image}
                  locale={locale}
                  sizes="72px"
                />
              )}
            </div>
            <div className="living-rail-piece-copy" aria-live="polite">
              {active.role && (
                <span className="living-rail-role">
                  {rail(active.role === "MAIN" ? "main" : "suggested")}
                </span>
              )}
              <strong>{active.title}</strong>
              <span>
                {variant.color} · <bdi>{variant.size}</bdi>
              </span>
              <span className="living-rail-sku">
                <bdi>{variant.sku}</bdi>
              </span>
              <strong data-testid="living-rail-unit-price">
                {variant.amount !== null && isPurchasable(variant)
                  ? money(variant.amount)
                  : t("unavailable")}
              </strong>
            </div>
            <div className="living-rail-controls">
              {active.variants.length > 1 && (
                <label>
                  {rail("size")}
                  <select
                    value={variant.id}
                    disabled={!interactive}
                    onChange={(event) => {
                      setSizes({
                        ...sizes,
                        [active.productId]: event.target.value,
                      });
                      setFeedback("");
                    }}
                  >
                    {active.variants.map((option) => (
                      <option
                        key={option.id}
                        value={option.id}
                        disabled={!isPurchasable(option)}
                      >
                        {option.size}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="living-rail-choose">
                <input
                  type="checkbox"
                  checked={selected.includes(active.productId)}
                  disabled={!interactive || !isPurchasable(variant)}
                  onChange={(event) =>
                    toggle(active.productId, event.target.checked)
                  }
                />
                {rail("choose")}
              </label>
              {lookHref && (
                <Link className="living-rail-product" href={active.href}>
                  {rail("viewProduct")}
                </Link>
              )}
            </div>
          </div>
        )}
        <div className="living-rail-total">
          <span>{rail("total")}</span>
          <strong aria-live="polite" data-testid="living-rail-total">
            {chosen.length ? money(total) : "—"}
          </strong>
        </div>
        <div className="living-rail-actions">
          {action && (
            <button
              type="button"
              disabled={!interactive || pending || !chosen.length}
              onClick={buy}
            >
              {rail("add")}
            </button>
          )}
          {lookHref && (
            <Link className="living-rail-full" href={lookHref}>
              {rail("viewFull")}
            </Link>
          )}
          {fittingHref && (
            <Link href={fittingHref} prefetch={false}>
              {t("tryLook")}
            </Link>
          )}
          {articleHref && <Link href={articleHref}>{t("relatedArticle")}</Link>}
        </div>
        <p className="living-rail-feedback" role="status">
          {feedback}
        </p>
      </div>
    </article>
  );
}
