"use client";
import { subscribeSceneRefresh } from "./scene-refresh";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ResponsiveImage,
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";
import { CommerceForm } from "./commerce-form";
import { addSceneAction } from "@/app/[locale]/commerce-actions";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import type { SceneView } from "@/modules/content/scenes/resolve";
import { SceneLayerImage } from "./scene-layer";
import { ActiveCarouselSlide } from "./carousel-context";
import { scenePointInFrame } from "@/modules/content/scenes/geometry";

export function ShoppableScene({
  view,
  locale,
  preview = false,
  poll = true,
  headingLevel,
  first = false,
  frame = "responsive",
  body,
  cta,
  revealTitle = false,
  presentation,
  eyebrow,
  secondary,
  decorations,
}: {
  view: SceneView;
  locale: "fa" | "tr" | "en";
  preview?: boolean;
  poll?: boolean;
  headingLevel?: 1 | 2 | 3;
  first?: boolean;
  frame?: "mobile" | "desktop" | "responsive";
  body?: string;
  cta?: { label: string; href: string };
  revealTitle?: boolean;
  presentation?: "hero" | "look";
  eyebrow?: string;
  secondary?: { label: string; href: string };
  decorations?: Record<string, ResponsiveImageMedia | null>;
}) {
  const activeSlide = useContext(ActiveCarouselSlide);
  const PurchasePanel = presentation === "hero" ? "details" : "div";
  const t = useTranslations("scenes"),
    shopping = useTranslations("shopping"),
    cutouts = useTranslations("cutouts");
  const root = useRef<HTMLElement>(null),
    router = useRouter();
  const [selections, select] = useState<Record<string, string>>({});
  const layers = view.pieces.map(
    (piece) =>
      piece.variants.find((variant) => variant.id === selections[piece.id])
        ?.layer ?? piece.layer,
  );
  const layerKey = JSON.stringify(layers);
  const [failedImages, failImage] = useState<Record<string, string>>({});
  const imageKey = (kind: "desktop" | "mobile") =>
    JSON.stringify([
      view[kind].media?.url,
      view[kind].media?.variants,
      layerKey,
    ]);
  const imageFailed = (kind: "desktop" | "mobile") =>
    failedImages[kind] === imageKey(kind);
  const imageRevision = JSON.stringify([
    view.desktop.media,
    view.mobile.media,
    layerKey,
  ]);
  useEffect(() => {
    const listeners: (() => void)[] = [];
    for (const kind of ["desktop", "mobile"] as const) {
      const images = root.current?.querySelectorAll<HTMLImageElement>(
        `[data-scene-frame="${kind}"] img`,
      );
      if (!images) continue;
      for (const image of images) {
        const key = JSON.stringify([
          view[kind].media?.url,
          view[kind].media?.variants,
          layerKey,
        ]);
        const failed = () => failImage((old) => ({ ...old, [kind]: key }));
        // SSR images can finish (or fail) before React hydrates. Observe their
        // actual decoded state as well as future errors, not just React events.
        if (image.complete && image.naturalWidth === 0) failed();
        image.addEventListener("error", failed);
        listeners.push(() => image.removeEventListener("error", failed));
      }
    }
    return () => listeners.forEach((remove) => remove());
  }, [imageRevision, view.desktop.media, view.mobile.media, layerKey]);
  const [refreshing, startRefresh] = useTransition();
  const pending = useRef(refreshing);
  useEffect(() => {
    pending.current = refreshing;
  }, [refreshing]);
  useEffect(() => {
    select({});
  }, [view.id]);
  useEffect(() => {
    if (preview || !poll) return;
    const subscription = subscribeSceneRefresh({
      visible: false,
      pending: () => pending.current,
      refresh: () => {
        pending.current = true;
        startRefresh(() => router.refresh());
      },
    });
    const observer = new IntersectionObserver((entries) => {
      subscription.visible(entries.some((entry) => entry.isIntersecting));
    });
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      subscription.dispose();
    };
  }, [router, preview, poll]);
  const chosen = view.pieces.map((piece) =>
    piece.variants.find((v) => v.id === selections[piece.id]),
  );
  const ready =
    !preview &&
    !view.reason &&
    !imageFailed("desktop") &&
    !imageFailed("mobile") &&
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
  // Keep Persian joining intact; Latin headings reveal graphemes independently.
  const title = revealTitle ? (
    <span aria-hidden="true">
      {[
        ...new Intl.Segmenter(locale, {
          granularity: locale === "fa" ? "word" : "grapheme",
        }).segment(view.title),
      ].map((part, index) => (
        <span
          key={index}
          className="moda-title-fragment"
          style={{ animationDelay: `${Math.min(index, 24) * 0.025}s` }}
        >
          {part.segment}
        </span>
      ))}
    </span>
  ) : (
    view.title
  );
  const copy = (
    <>
      {eyebrow && <p className="moda-eyebrow">{eyebrow}</p>}
      {(headingLevel ?? (first ? 1 : 2)) === 1 && activeSlide ? (
        <h1
          data-moda4={presentation === "hero" ? "hero-title" : undefined}
          data-moda4-display={
            presentation === "hero" &&
            /\p{Script=Latin}/u.test(view.title) &&
            !/\p{Script=Arabic}/u.test(view.title)
              ? ""
              : undefined
          }
          className="moda-scene-heading"
          aria-label={revealTitle ? view.title : undefined}
        >
          {title}
        </h1>
      ) : headingLevel === 3 ? (
        <h3>{view.title}</h3>
      ) : (
        <h2
          data-moda4={presentation === "hero" ? "hero-title" : undefined}
          data-moda4-display={
            presentation === "hero" &&
            /\p{Script=Latin}/u.test(view.title) &&
            !/\p{Script=Arabic}/u.test(view.title)
              ? ""
              : undefined
          }
          className="moda-scene-heading"
          aria-label={revealTitle ? view.title : undefined}
        >
          {title}
        </h2>
      )}
      {body &&
        (presentation === "hero" && body.includes("\n") ? (
          <>
            <div className="moda-hero-subtitle">{body.split("\n")[0]}</div>
            <p className="mb-5">{body.split("\n").slice(1).join("\n")}</p>
          </>
        ) : (
          <p className="mb-5">{body}</p>
        ))}
      <div className="moda-hero-acts">
        {cta && (
          <a
            data-moda4-cta=""
            className="button mb-5 inline-flex"
            href={cta.href}
          >
            {cta.label}
          </a>
        )}
        {secondary && (
          <a className="button button-outline" href={secondary.href}>
            {secondary.label}
          </a>
        )}
      </div>
    </>
  );
  return (
    <section
      ref={root}
      className="shoppable-scene"
      data-testid="shoppable-scene"
      data-moda4={presentation === "look" ? "shop-the-look" : undefined}
      data-presentation={presentation}
      data-scene-id={view.id}
      data-scene-confirmation={
        preview ? view.confirmationFingerprint : undefined
      }
      data-scene-confirmation-key={preview ? view.confirmationKey : undefined}
      data-scene-related-video={preview ? view.relatedVideo?.url : undefined}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      {presentation === "hero" ? (
        <div className="moda-hero-copy">{copy}</div>
      ) : (
        copy
      )}
      {view.mode === "COMPOSITE" && (
        <p className="scene-image-note">{cutouts("stylingOnly")}</p>
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
              data-scene-frame={kind}
              onErrorCapture={(event) => {
                if (event.target instanceof HTMLImageElement)
                  failImage((old) => ({ ...old, [kind]: imageKey(kind) }));
              }}
              className={`scene-photo scene-photo-${kind} ${frame !== "responsive" ? "scene-photo-forced" : ""}`}
              style={
                {
                  aspectRatio: current.frame.aspect.replace(":", " / "),
                  "--scene-aspect":
                    Number(current.frame.aspect.split(":")[0]) /
                    Number(current.frame.aspect.split(":")[1]),
                } as CSSProperties
              }
            >
              {current.media && !imageFailed(kind) ? (
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
              {view.mode === "COMPOSITE" &&
                current.media &&
                !imageFailed(kind) &&
                layers.map((layer, index) =>
                  layer ? (
                    <SceneLayerImage
                      key={view.pieces[index].id}
                      layer={layer}
                      model={current.media!}
                      frame={current.frame}
                      locale={locale}
                    />
                  ) : null,
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
                return point.visible && !imageFailed(kind) ? (
                  <a
                    key={piece.id}
                    className="scene-pin"
                    data-side={piece.side}
                    href={`#scene-piece-${view.id}-${piece.id}`}
                    style={{
                      left: `${point.x * 100}%`,
                      top: `${point.y * 100}%`,
                    }}
                    aria-label={`${piece.title} · ${price(piece)}`}
                    onClick={() => {
                      const panel =
                        root.current?.querySelector<HTMLDetailsElement>(
                          "details.moda-scene-purchase",
                        );
                      if (panel) panel.open = true;
                    }}
                  >
                    {presentation === "hero" && decorations?.[piece.id] && (
                      <ResponsiveImage
                        media={decorations[piece.id]!}
                        locale={locale}
                        sizes="180px"
                        imgClassName="w-full h-full object-contain"
                        className="moda-hero-float"
                      />
                    )}
                    <span className="scene-pin-index" aria-hidden="true">
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
      <PurchasePanel
        className="moda-scene-purchase"
        open={
          presentation === "hero" &&
          (view.reason || imageFailed("mobile") || imageFailed("desktop"))
            ? true
            : undefined
        }
      >
        {presentation === "hero" && (
          <summary className="moda-purchase-toggle sr-only focus:not-sr-only">
            {t("chooseSize")}
          </summary>
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
                {preview && piece.referenceImage && (
                  <ResponsiveImage
                    media={piece.referenceImage}
                    locale={locale}
                    sizes="120px"
                    className="block w-24"
                    imgClassName="w-full h-auto"
                  />
                )}
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
                    select((old) => ({
                      ...old,
                      [piece.id]: event.target.value,
                    }))
                  }
                  disabled={Boolean(view.reason) && !preview}
                >
                  <option value="">{t("chooseSize")}</option>
                  {piece.variants.map((v) => (
                    <option
                      key={v.id}
                      value={v.id}
                      disabled={v.available <= 0 || v.amount === null}
                    >
                      {v.size}
                      {v.id === piece.preferredVariantId
                        ? ` · ${t("suggested")}`
                        : ""}
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
      </PurchasePanel>
    </section>
  );
}
