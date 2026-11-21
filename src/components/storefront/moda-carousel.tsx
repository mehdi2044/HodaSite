"use client";
import { ModaWordmark } from "./moda-wordmark";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActiveCarouselSlide } from "./carousel-context";
import { useTranslations } from "next-intl";

function wrapIndex(index: number, count: number) {
  return ((index % count) + count) % count;
}

/** Common visibility/focus/hover/reduced-motion policy for the editable presentations. */
export function ModaCarousel({
  items,
  labels,
  seconds = 7,
  kind = "hero",
  title,
  art,
  intro,
}: {
  items: ReactNode[];
  labels: string[];
  seconds?: number;
  kind?: "hero" | "prism" | "lookbook" | "fitting";
  title?: string;
  art?: ReactNode[];
  intro?: ReactNode;
}) {
  const t = useTranslations("modaHomepage");
  const root = useRef<HTMLElement>(null),
    drag = useRef<{
      x: number;
      y: number;
      id: number;
      axis: "x" | "y" | null;
    } | null>(null);
  const suppressFaceClick = useRef(false);
  const [index, setIndex] = useState(0),
    [interactive, setInteractive] = useState(false),
    [paused, setPaused] = useState(false),
    [engaged, setEngaged] = useState(false),
    [resumeEngaged, setResumeEngaged] = useState(false),
    [visible, setVisible] = useState(false),
    [reduced, setReduced] = useState(true),
    [hidden, setHidden] = useState(true),
    [dragAngle, setDragAngle] = useState(0);
  const isPrism = kind === "prism";
  useEffect(() => {
    if (!isPrism || !root.current) return;
    const section = root.current;
    // Warm this bounded four-face presentation as it approaches the viewport.
    // Motion still uses the separate, actual-visibility observer below.
    const preload = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        section.querySelectorAll("img").forEach((image) => {
          image.loading = "eager";
        });
        preload.disconnect();
      },
      { rootMargin: "320px" },
    );
    preload.observe(section);
    return () => preload.disconnect();
  }, [isPrism, art]);
  const count = Math.max(1, items.length);
  // The prism keeps turning through the seam. Only the selected face wraps.
  const current = isPrism
    ? wrapIndex(index, count)
    : Math.min(index, count - 1);
  // Explicit resume also starts while its control has focus. A fresh
  // hover/focus engagement pauses rotation again.
  const running =
    !paused && (!engaged || resumeEngaged) && !reduced && !hidden && visible;
  const clock = useRef({ index: current, seconds, remaining: seconds * 1000 });
  useEffect(() => {
    setInteractive(true);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches),
      visibility = () => setHidden(document.hidden);
    motion();
    visibility();
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver((entries) =>
      setVisible(entries.some((entry) => entry.isIntersecting)),
    );
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!running || items.length < 2) return;
    if (clock.current.index !== current || clock.current.seconds !== seconds)
      clock.current = { index: current, seconds, remaining: seconds * 1000 };
    const started = performance.now();
    const timer = setTimeout(() => {
      clock.current.remaining = seconds * 1000;
      setIndex((old) => (isPrism ? old + 1 : (old + 1) % count));
    }, clock.current.remaining);
    return () => {
      clearTimeout(timer);
      clock.current.remaining = Math.max(
        0,
        clock.current.remaining - (performance.now() - started),
      );
    };
  }, [running, items.length, seconds, current, isPrism, count]);
  const change = (delta: number) =>
    setIndex((old) =>
      isPrism ? old + delta : wrapIndex(current + delta, count),
    );
  const select = (face: number) => {
    setIndex((old) => {
      if (!isPrism) return face;
      const forward = wrapIndex(face - old, count);
      return old + (forward > count / 2 ? forward - count : forward);
    });
  };
  const controls = (
    <>
      {" "}
      {items.length > 1 && (
        <div className="moda-carousel-controls">
          <button
            type="button"
            className="button button-outline"
            aria-label={t("previous")}
            disabled={!interactive}
            onClick={() => change(-1)}
          >
            ←
          </button>
          <div
            className="moda-carousel-tabs"
            data-moda4={kind === "hero" ? "hero-progress" : undefined}
          >
            {labels.map((label, n) => (
              <button
                key={n}
                type="button"
                aria-label={label}
                aria-pressed={n === current}
                disabled={!interactive}
                onClick={() => select(n)}
              >
                <span aria-hidden="true">
                  {kind === "prism" ? label : n + 1}
                </span>
                {n === current && (
                  <span
                    key={current}
                    className="moda-slide-progress"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button button-outline"
            aria-label={t("next")}
            disabled={!interactive}
            onClick={() => change(1)}
          >
            →
          </button>
          <button
            type="button"
            className="button button-outline"
            aria-pressed={paused || reduced}
            aria-label={t(paused || reduced ? "resume" : "pause")}
            title={t(paused || reduced ? "resume" : "pause")}
            onClick={() => {
              setResumeEngaged(paused);
              setPaused(!paused);
            }}
            disabled={!interactive || reduced}
          >
            {kind === "hero"
              ? t(paused || reduced ? "resumeShort" : "pauseShort")
              : t(paused || reduced ? "resumeShort" : "pauseShort")}
          </button>
        </div>
      )}
    </>
  );
  return (
    <section
      ref={root}
      data-moda4={kind === "hero" ? "hero" : undefined}
      className={`moda-carousel moda-carousel-${kind}`}
      data-reduced={reduced}
      data-running={running}
      style={{ "--slide-seconds": `${seconds}s` } as React.CSSProperties}
      aria-roledescription={t("carousel")}
      aria-label={title || labels[current]}
      onMouseEnter={() => {
        setEngaged(true);
        setResumeEngaged(false);
      }}
      onMouseLeave={() => {
        const focused = Boolean(root.current?.contains(document.activeElement));
        setEngaged(focused);
        if (!focused) setResumeEngaged(false);
      }}
      onFocusCapture={() => {
        setEngaged(true);
        setResumeEngaged(false);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          const hovered = event.currentTarget.matches(":hover");
          setEngaged(hovered);
          if (!hovered) setResumeEngaged(false);
        }
      }}
    >
      {kind === "prism" && intro ? (
        <div className="moda-prism-copy">
          {intro}
          {controls}
          <div className="moda-prism-links">
            {items.map((item, n) => (
              <div key={n} hidden={n !== current}>
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : (
        title && <h2 className="moda-section-heading">{title}</h2>
      )}
      <div
        className="moda-carousel-stage"
        tabIndex={art ? 0 : undefined}
        aria-label={art ? title : undefined}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !art) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const rtl = document.documentElement.dir === "rtl";
            change((event.key === "ArrowRight") !== rtl ? 1 : -1);
          }
        }}
        onPointerDown={(event) => {
          if (items.length < 2 || !event.isPrimary || event.button !== 0)
            return;
          suppressFaceClick.current = false;
          const control = (event.target as Element).closest(
            "a,button,input,select,textarea,summary",
          );
          // The pictured face is a link, but it must also accept a drag.
          if (control && !(isPrism && control.closest(".moda-3d-face"))) return;
          setEngaged(true);
          setResumeEngaged(false);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
            axis: null,
          };
        }}
        onPointerMove={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          const distance = event.clientX - drag.current.x;
          const vertical = event.clientY - drag.current.y;
          if (
            !drag.current.axis &&
            Math.max(Math.abs(distance), Math.abs(vertical)) > 8
          )
            drag.current.axis =
              Math.abs(distance) > Math.abs(vertical) * 1.2 ? "x" : "y";
          if (drag.current.axis !== "x") return;
          if (
            Boolean(art) &&
            Math.abs(distance) > 45 &&
            !event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            suppressFaceClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (!isPrism || !reduced) setDragAngle(distance / 3);
        }}
        onPointerUp={(event) => {
          const begin = drag.current;
          drag.current = null;
          setDragAngle(0);
          setEngaged(
            Boolean(root.current?.contains(document.activeElement)) ||
              Boolean(root.current?.matches(":hover")),
          );
          if (
            begin?.id === event.pointerId &&
            begin.axis === "x" &&
            Math.abs(event.clientX - begin.x) > 45
          ) {
            suppressFaceClick.current = Boolean(art);
            change(
              event.clientX < begin.x !==
                (document.documentElement.dir === "rtl")
                ? 1
                : -1,
            );
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragAngle(0);
        }}
        onClickCapture={(event) => {
          if (suppressFaceClick.current && event.detail !== 0) {
            suppressFaceClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDragStart={(event) => {
          if (art) event.preventDefault();
        }}
      >
        {art && art.length > 1 ? (
          <div
            data-moda4={kind === "prism" ? "worlds-prism" : "lookbook-ring"}
            className="moda-3d-orbit"
            style={{
              transform: `${kind === "lookbook" ? "translateZ(calc(-1 * var(--look-radius))) " : ""}rotateX(${isPrism ? -9 : 0}deg) rotateY(${-(isPrism ? index : current) * (360 / art.length) + dragAngle}deg)`,
            }}
          >
            {art.map((image, n) => (
              <div
                key={n}
                data-moda4={kind === "prism" ? "worlds-face" : "lookbook-card"}
                inert={n !== current}
                aria-hidden={n !== current}
                className={`moda-3d-face ${kind === "lookbook" ? "moda-arch-face" : ""}`}
                style={{
                  transform: `rotateY(${(n * 360) / art.length}deg) translateZ(${kind === "prism" ? "var(--prism-depth)" : "var(--look-radius)"})`,
                }}
              >
                {image}
              </div>
            ))}
            {kind === "prism" && (
              <div className="moda-prism-cap" aria-hidden="true">
                <ModaWordmark />
              </div>
            )}
          </div>
        ) : null}
        {!art &&
          items.map((item, n) => (
            <div
              key={n}
              className="moda-carousel-slide"
              hidden={n !== current}
              data-active={n === current}
            >
              <ActiveCarouselSlide.Provider value={n === current}>
                {item}
              </ActiveCarouselSlide.Provider>
            </div>
          ))}
      </div>
      {art && kind !== "prism" && (
        <div className="moda-orbit-selected">
          {items.map((item, n) => (
            <div key={n} hidden={n !== current}>
              {item}
            </div>
          ))}
        </div>
      )}
      {kind !== "prism" && controls}
    </section>
  );
}
