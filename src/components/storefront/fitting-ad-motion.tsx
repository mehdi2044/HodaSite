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
    [active, setActive] = useState(false),
    [replay, setReplay] = useState(0);
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
  const flightIdentity = JSON.stringify([
    view.id,
    view.desktop.media,
    view.mobile.media,
    view.pieces.map((piece) => [piece.id, piece.layer]),
  ]);
  useEffect(() => {
    const element = root.current,
      stage = element?.querySelector<HTMLElement>(".moda-fitting-stage");
    if (!active || !stage) return;
    const animations: Animation[] = [],
      nodes: HTMLElement[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined,
      frame = 0,
      cancelled = false;
    const animate = (
      element: Element | null,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      if (element?.animate)
        animations.push(element.animate(frames, { fill: "both", ...options }));
    };
    const clear = () => {
      animations.splice(0).forEach((animation) => animation.cancel());
      nodes.splice(0).forEach((node) => node.remove());
    };
    const run = () => {
      clear();
      if (cancelled) return;
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      let latest = 0;
      for (const source of stage.querySelectorAll<HTMLElement>(
        "[data-fitting-piece-source]",
      )) {
        const id = source.dataset.fittingPieceSource;
        const target = [
          ...stage.querySelectorAll<HTMLElement>("[data-fitting-piece-target]"),
        ].find((target) => target.dataset.fittingPieceTarget === id);
        const picture = source.querySelector("picture");
        if (!target || !picture) continue;
        const from = source.getBoundingClientRect(),
          to = target.getBoundingClientRect(),
          begin = 300 + nodes.length * 850;
        if (!from.width || !from.height || !to.width || !to.height) continue;
        const flight = document.createElement("div");
        flight.className = "moda-fitting-flight";
        flight.setAttribute("aria-hidden", "true");
        Object.assign(flight.style, {
          left: `${from.left - bounds.left}px`,
          top: `${from.top - bounds.top}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
        });
        flight.appendChild(picture.cloneNode(true));
        stage.appendChild(flight);
        nodes.push(flight);
        const targetStyle = getComputedStyle(target);
        const dx = to.left + to.width / 2 - from.left - from.width / 2,
          dy = to.top + to.height / 2 - from.top - from.height / 2,
          sx = parseFloat(targetStyle.width) / from.width,
          sy = parseFloat(targetStyle.height) / from.height;
        const rotation = Number(target.dataset.fittingRotation ?? 0);
        animate(
          flight,
          [
            { opacity: 0, transform: "none" },
            { opacity: 1, transform: "none", offset: 0.02 },
            {
              opacity: 1,
              transform: `translate3d(${dx * 0.5}px,${dy * 0.5 - 30}px,80px) rotateY(180deg) scale(${(1 + sx) / 2},${(1 + sy) / 2})`,
              offset: 0.5,
            },
            {
              opacity: 1,
              transform: `translate3d(${dx}px,${dy}px,0) rotateY(360deg) rotateZ(${rotation}deg) scale(${sx},${sy})`,
              offset: 0.98,
            },
            {
              opacity: 0,
              transform: `translate3d(${dx}px,${dy}px,0) rotateY(360deg) rotateZ(${rotation}deg) scale(${sx},${sy})`,
            },
          ],
          { duration: 1000, delay: begin, easing: "ease-in-out" },
        );
        animate(source, [{ opacity: 1 }, { opacity: 0 }], {
          duration: 250,
          delay: begin,
        });
        animate(target, [{ opacity: 0 }, { opacity: 1 }], {
          duration: 1,
          delay: begin + 980,
        });
        latest = begin + 1000;
      }
      if (!latest) return;
      const base = stage.querySelector(".moda-scene-base"),
        sketch = stage.querySelector(".moda-fitting-sketch");
      animate(
        base,
        [{ opacity: 0 }, { opacity: 0, offset: 0.85 }, { opacity: 1 }],
        { duration: latest + 1700 },
      );
      animate(
        sketch,
        [{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }],
        { duration: latest + 1700 },
      );
      animate(
        stage.querySelector(".moda-fitting-scan"),
        [
          { opacity: 0, top: "5%" },
          { opacity: 0.7, top: "5%", offset: 0.1 },
          { opacity: 0.7, top: "85%", offset: 0.9 },
          { opacity: 0, top: "85%" },
        ],
        { delay: latest, duration: 1000 },
      );
      timer = setTimeout(run, latest + 2900);
    };
    frame = requestAnimationFrame(run);
    const resize = () => {
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(frame);
      clear();
      frame = requestAnimationFrame(run);
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", resize);
      clear();
    };
  }, [active, replay, flightIdentity]);
  return (
    <div ref={root} className="moda-fitting-motion" data-running={active}>
      <div className="moda-fitting-stage" aria-hidden="true">
        <div className="moda-clothes-rack">
          {view.pieces.map((piece, index) => (
            <div
              className="moda-hanging-garment"
              key={piece.id}
              data-fitting-piece-source={piece.id}
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
          <SceneArt view={view} locale={locale} sketch />
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
      <button
        className="button button-outline"
        type="button"
        onClick={() => setReplay((value) => value + 1)}
      >
        {t("replay")}
      </button>
      <div className="moda-fitting-final">{final}</div>
    </div>
  );
}
