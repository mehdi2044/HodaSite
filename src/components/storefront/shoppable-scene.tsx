"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ResponsiveImage, isDemoFashionMedia } from "./responsive-image";
import { CommerceForm } from "./commerce-form";
import { addSceneAction } from "@/app/[locale]/commerce-actions";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import type { SceneView } from "@/modules/content/scenes/resolve";
import { scenePointInFrame } from "@/modules/content/scenes/geometry";

export function ShoppableScene({
  view,
  locale,
  preview = false,
  first = false,
  frame = "responsive",
  body,
  cta,
}: {
  view: SceneView;
  locale: "fa" | "tr" | "en";
  preview?: boolean;
  first?: boolean;
  frame?: "mobile" | "desktop" | "responsive";
  body?: string;
  cta?: { label: string; href: string };
}) {
  const t = useTranslations("scenes"),
    shopping = useTranslations("shopping");
  const root = useRef<HTMLElement>(null),
    router = useRouter();
  const [selections, select] = useState<Record<string, string>>({});
  const [refreshing, startRefresh] = useTransition();
  const pending = useRef(refreshing);
  useEffect(() => {
    pending.current = refreshing;
  }, [refreshing]);
  useEffect(() => {
    select({});
  }, [view.id]);
  useEffect(() => {
    if (preview) return;
    let visible = false;
    const refresh = () => {
      if (visible && !document.hidden && !pending.current)
        startRefresh(() => router.refresh());
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
    });
    if (root.current) observer.observe(root.current);
    const timer = setInterval(refresh, 4000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      observer.disconnect();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, preview]);
  const chosen = view.pieces.map((piece) =>
    piece.variants.find((v) => v.id === selections[piece.id]),
  );
  const ready =
    !preview &&
    !view.reason &&
    view.pieces.length > 0 &&
    chosen.every((v) => v && v.available > 0 && v.amount !== null);
  const price = (piece: SceneView["pieces"][number]) => {
    const selected = piece.variants.find((v) => v.id === selections[piece.id]);
    if (
      selected?.amount !== null &&
      selected?.amount !== undefined &&
      selected.available > 0
    )
      return formatStorefrontAmount(selected.amount, view.currency, locale);
    if (!piece.range)
      return t(
        piece.variants.some((v) => v.available > 0)
          ? "priceUnavailable"
          : "outOfStock",
      );
    const min = formatStorefrontAmount(piece.range.min, view.currency, locale);
    return piece.range.min === piece.range.max
      ? min
      : t("from", { price: min });
  };
  return (
    <section
      ref={root}
      className="shoppable-scene"
      data-testid="shoppable-scene"
      data-scene-id={view.id}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      {first ? <h1>{view.title}</h1> : <h2>{view.title}</h2>}
      {body && <p className="mb-5">{body}</p>}
      {cta && (
        <a className="button mb-5 inline-flex" href={cta.href}>
          {cta.label}
        </a>
      )}
      {view.reason && (
        <p role="status" className="scene-review">
          {t(view.reason)}
        </p>
      )}
      {(["desktop", "mobile"] as const)
        .filter((kind) => frame === "responsive" || frame === kind)
        .map((kind) => {
          const current = view[kind];
          return (
            <div
              key={kind}
              className={`scene-photo scene-photo-${kind} ${frame !== "responsive" ? "scene-photo-forced" : ""}`}
              style={{ aspectRatio: current.frame.aspect.replace(":", " / ") }}
            >
              {current.media ? (
                <ResponsiveImage
                  media={{
                    ...current.media,
                    altI18n: { [locale]: view.alt },
                    presentation: {
                      fit: current.frame.fit,
                      focalX: current.frame.focal.x,
                      focalY: current.frame.focal.y,
                    },
                  }}
                  locale={locale}
                  sizes="(min-width:1024px) 70vw,100vw"
                  priority={first}
                  role="hero"
                  imgClassName="h-full w-full"
                />
              ) : (
                <p>{t("missingImage")}</p>
              )}
              {view.pieces.map((piece, n) => {
                const point = current.media
                  ? scenePointInFrame(
                      piece[kind],
                      {
                        width: current.media.width ?? 0,
                        height: current.media.height ?? 0,
                      },
                      current.frame,
                    )
                  : { x: 0, y: 0, visible: false };
                return point.visible ? (
                  <a
                    key={piece.id}
                    className="scene-pin"
                    href={`#scene-piece-${view.id}-${piece.id}`}
                    style={{
                      left: `${point.x * 100}%`,
                      top: `${point.y * 100}%`,
                    }}
                    aria-label={`${piece.title} · ${price(piece)}`}
                  >
                    <span aria-hidden="true">
                      {new Intl.NumberFormat(locale).format(n + 1)}
                    </span>
                    <span className="scene-pin-price moda-price">
                      <bdi>{price(piece)}</bdi>
                    </span>
                  </a>
                ) : null;
              })}
            </div>
          );
        })}
      {(isDemoFashionMedia(view.desktop.media ?? undefined) ||
        isDemoFashionMedia(view.mobile.media ?? undefined)) && (
        <p className="scene-image-note">{shopping("demoImage")}</p>
      )}
      <CommerceForm
        action={addSceneAction.bind(null, locale)}
        className="scene-price-list"
      >
        <input type="hidden" name="sceneId" value={view.id} />
        {view.pieces.map((piece, n) => (
          <article
            key={piece.id}
            id={`scene-piece-${view.id}-${piece.id}`}
            data-testid={`scene-piece-${piece.id}`}
          >
            <div>
              <a href={piece.href}>
                {new Intl.NumberFormat(locale).format(n + 1)}. {piece.title}
              </a>
              <p>{piece.color}</p>
            </div>
            <strong className="moda-price">
              <bdi>{price(piece)}</bdi>
            </strong>
            <label>
              {t("size")}
              <select
                className="input"
                name="variantId"
                value={selections[piece.id] ?? ""}
                onChange={(event) =>
                  select((old) => ({ ...old, [piece.id]: event.target.value }))
                }
                disabled={preview || Boolean(view.reason)}
              >
                <option value="">{t("chooseSize")}</option>
                {piece.variants.map((v) => (
                  <option
                    key={v.id}
                    value={v.id}
                    disabled={v.available <= 0 || v.amount === null}
                  >
                    {v.size}
                    {v.available <= 0 ? ` · ${t("outOfStock")}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
        {view.pieces.length > 0 && (
          <>
            <p>{preview ? t("previewOnly") : t("chooseEverySize")}</p>
            <button className="button" disabled={!ready}>
              {t("addScene")}
            </button>
          </>
        )}
      </CommerceForm>
    </section>
  );
}
