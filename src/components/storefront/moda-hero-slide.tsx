"use client";
/**
 * M4-01 — one hero slide. Replaces <ShoppableScene presentation="hero">.
 * Composition contract: docs/design/moda4-redesign/m4-01-02/SPEC_M4-01_HERO.md
 *  - copy box on the photo's empty PHYSICAL side (data-copy-side)
 *  - every worn garment: numbered dot on the garment + readable name/price
 *    (label on desktop, price strip on stacked layouts) — owner rule 2026-10-14
 *  - optional float (cross-sell cutout) beside the person, desktop ≥1280 only
 *  - pins are positioned by CSS (container-query cover projection); the
 *    client guard only resolves visibility, so SSR == first paint.
 * D81 size choice and set purchase remain inside this slide.
 */
import {
  useContext,
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  HeroImageValid,
  HeroPriceSelection,
  HeroLayerSelection,
  type HeroSelectedLayers,
} from "./hero-image-state";
import type { SceneView } from "@/modules/content/scenes/resolve";
import { ActiveCarouselSlide } from "./carousel-context";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";
import { useHeroLayoutGuard } from "./use-hero-layout-guard";
import {
  displayTitleText,
  splitDisplayTitle,
  type HeroLayout,
} from "@/modules/content/hero-layout";

export type HeroPinView = {
  id: string;
  title: string;
  /** Formatted on the server from the catalog resolver; never a stored amount. */
  price: string;
  href: string;
  desktop: { x: number; y: number };
  mobile: { x: number; y: number };
};
type Frame = {
  media: ResponsiveImageMedia | null;
  focal: { x: number; y: number };
};

export function ModaHeroSlide({
  locale,
  index,
  first,
  layout,
  desktop,
  mobile,
  eyebrow,
  title,
  subtitle,
  body,
  cta,
  secondary,
  accent = false,
  pins,
  float,
  demoNote,
  labels,
  sceneId,
  purchase,
  view,
  preview = false,
}: {
  locale: "fa" | "tr" | "en";
  index: number;
  first: boolean;
  layout: HeroLayout;
  desktop: Frame;
  mobile: Frame;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  body?: string;
  cta?: { label: string; href: string };
  secondary?: { label: string; href: string };
  accent?: boolean;
  pins: HeroPinView[];
  float: {
    media: ResponsiveImageMedia;
    title: string;
    price: string;
    href: string;
  } | null;
  demoNote?: string;
  labels: { prices: string };
  /** Scene identity: the slide root is the scene for e2e/a11y (D81 purchase stays in the hero). */
  sceneId: string;
  /** <ShoppableScene only="purchase" …/>: size choice + add-set sheet, opened from a pin. */
  purchase?: ReactNode;
  view: SceneView;
  preview?: boolean;
}) {
  const t = useTranslations("scenes");
  const [failed, setFailed] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<HeroSelectedLayers>({});
  const [selectedPrices, setSelectedPrices] = useState<Record<string, string>>(
    {},
  );
  const pinPrice = (pin: HeroPinView) => selectedPrices[pin.id] ?? pin.price;
  const active = useContext(ActiveCarouselSlide);
  const ref = useRef<HTMLDivElement>(null);
  useHeroLayoutGuard(
    ref,
    active,
    JSON.stringify([
      selectedPrices,
      selectedLayers,
      layout,
      desktop,
      mobile,
      pins,
      float,
      title,
      subtitle,
      body,
    ]),
  );
  const number = new Intl.NumberFormat(locale);
  const openSheet = (pieceId: string) => {
    const sheet = ref.current?.querySelector<HTMLDetailsElement>(
      "details.moda-scene-purchase",
    );
    if (sheet) {
      sheet.open = true;
      sheet
        .querySelector<HTMLElement>(
          `[data-testid="scene-piece-${CSS.escape(pieceId)}"] select`,
        )
        ?.focus({ preventScroll: true });
    }
  };
  useEffect(() => {
    const images = [
      ...(ref.current?.querySelectorAll<HTMLImageElement>(".m4-media img") ??
        []),
    ];
    const check = () =>
      setFailed(images.some((img) => img.complete && img.naturalWidth === 0));
    check();
    images.forEach((img) => {
      img.addEventListener("error", check);
      img.addEventListener("load", check);
    });
    return () =>
      images.forEach((img) => {
        img.removeEventListener("error", check);
        img.removeEventListener("load", check);
      });
  }, [desktop.media, mobile.media, selectedLayers]);
  const ratio = (m: ResponsiveImageMedia | null, fallback: number) =>
    m?.width && m?.height ? m.width / m.height : fallback;
  // Latin display title: last word light (prototype "City <em>Layers</em>").
  const latin =
    /\p{Script=Latin}/u.test(title) && !/\p{Script=Arabic}/u.test(title);
  const parts = splitDisplayTitle(title);
  const heading =
    latin && parts.light ? (
      <>
        {parts.strong} <em>{parts.light}</em>
      </>
    ) : (
      displayTitleText(title)
    );
  const Heading = first && active ? "h1" : "h2";
  const modelFrame = (frame: SceneView["desktop"], key: "d" | "m") =>
    view.mode === "COMPOSITE" && frame.frame.fit === "contain"
      ? {
          [`--rw-${key}`]: `min(100cqw, (100cqh - var(--moda-header-height, 72px)) * var(--ar-${key}))`,
          [`--rh-${key}`]: `calc(var(--rw-${key}) / var(--ar-${key}))`,
          [`--oy-${key}`]: "var(--moda-header-height, 72px)",
          [`--fx-${key}`]:
            key === "m" ? 0.5 : layout.copySide === "right" ? 0 : 1,
        }
      : {};
  const style = {
    "--ar-d": ratio(desktop.media, 2),
    "--fx-d": desktop.focal.x,
    "--fy-d": desktop.focal.y,
    "--ar-m": ratio(mobile.media, 0.75),
    "--fx-m": mobile.focal.x,
    "--fy-m": mobile.focal.y,
    "--x0": layout.subject.x0,
    "--x1": layout.subject.x1,
    ...modelFrame(view.desktop, "d"),
    ...modelFrame(view.mobile, "m"),
  } as CSSProperties;
  return (
    <div
      ref={ref}
      className="m4-slide"
      data-moda4="hero-slide"
      data-slide={index}
      data-copy-side={layout.copySide}
      data-strip="on"
      data-scene-id={sceneId}
      data-scene-confirmation={
        preview ? view.confirmationFingerprint : undefined
      }
      data-scene-confirmation-key={preview ? view.confirmationKey : undefined}
      data-scene-related-video={preview ? view.relatedVideo?.url : undefined}
      data-testid="shoppable-scene"
      data-image-failed={failed}
      style={style}
    >
      <div className="m4-media m4-media-desktop" data-scene-frame="desktop">
        {(failed || !desktop.media) && (
          <p className="m4-image-fallback">{t("missingImage")}</p>
        )}
        <div className="m4-image-canvas">
          {desktop.media && (
            <ResponsiveImage
              media={{ ...desktop.media, altI18n: { [locale]: view.alt } }}
              locale={locale}
              sizes="100vw"
              priority={first}
              role="hero"
            />
          )}
          {view.mode === "COMPOSITE" && (
            <HeroLayers view={view} locale={locale} selected={selectedLayers} />
          )}
        </div>
      </div>
      <div className="m4-media m4-media-mobile" data-scene-frame="mobile">
        {(failed || !mobile.media) && (
          <p className="m4-image-fallback">{t("missingImage")}</p>
        )}
        <div className="m4-image-canvas">
          {mobile.media && (
            <ResponsiveImage
              media={{ ...mobile.media, altI18n: { [locale]: view.alt } }}
              locale={locale}
              sizes="100vw"
              priority={first}
              role="hero"
            />
          )}
          {view.mode === "COMPOSITE" && (
            <HeroLayers view={view} locale={locale} selected={selectedLayers} />
          )}
        </div>
      </div>
      <div
        className="m4-subject"
        data-moda4="hero-subject"
        aria-hidden="true"
      />
      <ol className="m4-pins">
        {pins.map((pin, n) => (
          <li
            key={pin.id}
            className="m4-pin"
            data-moda4="hero-pin"
            data-n={n + 1}
            data-label="none"
            style={
              {
                "--px-d": pin.desktop.x,
                "--py-d": pin.desktop.y,
                "--px-m": pin.mobile.x,
                "--py-m": pin.mobile.y,
              } as CSSProperties
            }
          >
            <button
              type="button"
              className="scene-pin"
              aria-controls={`scene-piece-${sceneId}-${pin.id}`}
              aria-label={`${pin.title} · ${pinPrice(pin)}`}
              onClick={() => openSheet(pin.id)}
            >
              <span className="m4-dot" aria-hidden="true">
                {number.format(n + 1)}
              </span>
              <span className="m4-tag" aria-hidden="true">
                <b>{pin.title}</b>
                <bdi className="moda-price">{pinPrice(pin)}</bdi>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {float && (
        <a
          href={float.href}
          className="m4-float"
          data-moda4="hero-float"
          hidden
          aria-label={`${float.title} · ${float.price}`}
        >
          <ResponsiveImage
            media={float.media}
            locale={locale}
            sizes="150px"
            imgClassName="h-auto w-full object-contain"
          />
          <span className="m4-float-note" aria-hidden="true">
            {float.title} · <bdi className="moda-price">{float.price}</bdi>
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <ellipse
                cx="50"
                cy="20"
                rx="47"
                ry="17"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.4"
                filter="url(#moda4-crayon-line)"
              />
            </svg>
          </span>
        </a>
      )}
      <div className="m4-copy" data-moda4="hero-copy">
        {eyebrow && <p className="m4-eyebrow">{eyebrow}</p>}
        <Heading
          className="m4-title moda-scene-heading"
          data-moda4="hero-title"
          data-moda4-display={latin ? "" : undefined}
          lang={latin ? "en" : locale}
          dir={latin ? "ltr" : undefined}
        >
          {heading}
        </Heading>
        {subtitle && <div className="m4-sub">{subtitle}</div>}
        {body && <p className="m4-body">{body}</p>}
        {pins.length > 0 && (
          <ul
            className="m4-strip"
            data-moda4="hero-prices"
            aria-label={labels.prices}
          >
            {pins.map((pin, n) => (
              <li key={pin.id}>
                <button
                  type="button"
                  aria-controls={`scene-piece-${sceneId}-${pin.id}`}
                  onClick={() => openSheet(pin.id)}
                >
                  <i aria-hidden="true">{number.format(n + 1)}</i>
                  <span>{pin.title}</span>
                  <bdi className="moda-price">{pinPrice(pin)}</bdi>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="m4-acts moda-hero-acts">
          {cta && (
            <a
              data-moda4-cta=""
              className={`button${accent ? " m4-cta-accent" : " m4-cta-ink"}`}
              href={cta.href}
            >
              {cta.label}
            </a>
          )}
          {secondary && (
            <a
              data-moda4-cta=""
              className="button button-outline"
              href={secondary.href}
            >
              {secondary.label}
            </a>
          )}
        </div>
      </div>
      {demoNote && <p className="m4-demo">{demoNote}</p>}
      {(failed || view.reason) && (
        <p className="m4-unavailable" role="status">
          {t(view.reason ?? "missingImage")}
        </p>
      )}
      <HeroImageValid.Provider value={!failed}>
        <HeroPriceSelection.Provider value={setSelectedPrices}>
          <HeroLayerSelection.Provider value={setSelectedLayers}>
            {purchase}
          </HeroLayerSelection.Provider>
        </HeroPriceSelection.Provider>
      </HeroImageValid.Provider>
    </div>
  );
}
function HeroLayers({
  view,
  locale,
  selected,
}: {
  view: SceneView;
  selected: HeroSelectedLayers;
  locale: "fa" | "tr" | "en";
}) {
  return view.pieces.map((piece) => {
    const layer = selected[piece.id] ?? piece.layer;
    return layer ? (
      <div
        key={piece.id}
        data-scene-layer="true"
        className="m4-layer"
        style={{
          left: layer.geometry.x * 100 + "%",
          top: layer.geometry.y * 100 + "%",
          width: layer.geometry.width * layer.geometry.scale * 100 + "%",
          height: layer.geometry.height * layer.geometry.scale * 100 + "%",
          zIndex: layer.geometry.zIndex,
          transform: `translate(-50%,-50%) rotate(${layer.geometry.rotation}deg)`,
        }}
      >
        <ResponsiveImage media={layer.media} locale={locale} sizes="50vw" />
      </div>
    ) : null;
  });
}
