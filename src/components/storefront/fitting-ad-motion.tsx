"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ResponsiveImage } from "./responsive-image";
import { SceneArt } from "./scene-art";
import type { SceneView } from "@/modules/content/scenes/resolve";
export function FittingAdMotion({
  view,
  locale,
  final,
}: {
  view: SceneView;
  locale: "fa" | "tr" | "en";
  final: ReactNode;
}) {
  const t = useTranslations("modaHomepage"),
    root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false),
    [active, setActive] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false,
      focus = false;
    const update = () =>
      setActive(
        visible && !focus && !document.hidden && !media.matches && !paused,
      );
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      update();
    });
    if (root.current) observer.observe(root.current);
    const enter = () => {
        focus = true;
        update();
      },
      leave = () => {
        focus = Boolean(root.current?.contains(document.activeElement));
        update();
      };
    const element = root.current;
    element?.addEventListener("mouseenter", enter);
    element?.addEventListener("mouseleave", leave);
    element?.addEventListener("focusin", enter);
    element?.addEventListener("focusout", leave);
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      element?.removeEventListener("mouseenter", enter);
      element?.removeEventListener("mouseleave", leave);
      element?.removeEventListener("focusin", enter);
      element?.removeEventListener("focusout", leave);
      document.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
    };
  }, [paused]);
  return (
    <div ref={root} className="moda-fitting-motion" data-running={active}>
      <div className="moda-fitting-stage" aria-hidden="true">
        <div className="moda-clothes-rack">
          {view.pieces.map((piece, index) => (
            <div
              className="moda-hanging-garment"
              key={piece.id}
              style={
                { "--garment-delay": `${index * 1.3}s` } as React.CSSProperties
              }
            >
              <span className="moda-hanger" />
              {piece.layer ? (
                <ResponsiveImage
                  media={{
                    ...piece.layer.media,
                    presentation: { fit: "contain", focalX: 0.5, focalY: 0.5 },
                  }}
                  locale={locale}
                  sizes="160px"
                  imgClassName="h-full w-full"
                />
              ) : (
                <span className="moda-rack-label">{piece.title}</span>
              )}
            </div>
          ))}
        </div>
        <div className="moda-fitting-model">
          <SceneArt view={view} locale={locale} />
          <div className="moda-fitting-scan" />
        </div>
      </div>
      <p>{t("stylingDemonstration")}</p>
      <button
        className="button button-outline"
        type="button"
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? t("resume") : t("pause")}
      </button>
      <div className="moda-fitting-final">{final}</div>
    </div>
  );
}
