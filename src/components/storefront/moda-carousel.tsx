"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
/** Common visibility/focus/hover/reduced-motion policy for the editable presentations. */
export function ModaCarousel({
  items,
  labels,
  seconds = 7,
  kind = "hero",
  title,
  art,
}: {
  items: ReactNode[];
  labels: string[];
  seconds?: number;
  kind?: "hero" | "prism" | "lookbook" | "fitting";
  title?: string;
  art?: ReactNode[];
}) {
  const t = useTranslations("modaHomepage");
  const root = useRef<HTMLElement>(null),
    drag = useRef<{ x: number; id: number } | null>(null);
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [engaged, setEngaged] = useState(false),
    [visible, setVisible] = useState(false),
    [reduced, setReduced] = useState(true),
    [hidden, setHidden] = useState(true),
    [dragAngle, setDragAngle] = useState(0);
  const current = Math.min(index, Math.max(0, items.length - 1));
  useEffect(() => {
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
    if (paused || engaged || reduced || hidden || !visible || items.length < 2)
      return;
    const timer = setInterval(
      () => setIndex((old) => (old + 1) % items.length),
      seconds * 1000,
    );
    return () => clearInterval(timer);
  }, [paused, engaged, reduced, hidden, visible, items.length, seconds]);
  const change = (delta: number) =>
    setIndex((current + delta + items.length) % items.length);
  return (
    <section
      ref={root}
      className={`moda-carousel moda-carousel-${kind}`}
      data-reduced={reduced}
      data-running={!paused && !engaged && !reduced && !hidden && visible}
      style={{ "--slide-seconds": `${seconds}s` } as React.CSSProperties}
      aria-roledescription={t("carousel")}
      aria-label={title || labels[current]}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() =>
        setEngaged(Boolean(root.current?.contains(document.activeElement)))
      }
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setEngaged(false);
      }}
    >
      {title && <h2 className="moda-section-heading">{title}</h2>}
      <div
        className="moda-carousel-stage"
        onPointerDown={(event) => {
          if (
            items.length < 2 ||
            (event.target as Element).closest("a,button,input,select,textarea")
          )
            return;
          drag.current = { x: event.clientX, id: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current?.id === event.pointerId)
            setDragAngle((event.clientX - drag.current.x) / 3);
        }}
        onPointerUp={(event) => {
          const begin = drag.current;
          drag.current = null;
          setDragAngle(0);
          if (
            begin?.id === event.pointerId &&
            Math.abs(event.clientX - begin.x) > 45
          )
            change(event.clientX < begin.x ? 1 : -1);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragAngle(0);
        }}
      >
        {art && art.length > 1 ? (
          <div
            className="moda-3d-orbit"
            style={{
              transform: `rotateX(${kind === "prism" ? -9 : 0}deg) rotateY(${-current * (360 / art.length) + dragAngle}deg)`,
            }}
          >
            {art.map((image, n) => (
              <div
                key={n}
                inert={n !== current}
                aria-hidden={n !== current}
                className={`moda-3d-face ${kind === "lookbook" ? "moda-arch-face" : ""}`}
                style={{
                  transform: `rotateY(${(n * 360) / art.length}deg) translateZ(${kind === "prism" ? 165 : 430}px)`,
                }}
              >
                {image}
              </div>
            ))}
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
              {item}
            </div>
          ))}
      </div>
      {art && (
        <div className="moda-orbit-selected">
          {items.map((item, n) => (
            <div key={n} hidden={n !== current}>
              {item}
            </div>
          ))}
        </div>
      )}
      {items.length > 1 && (
        <div className="moda-carousel-controls">
          <button
            type="button"
            className="button button-outline"
            aria-label={t("previous")}
            onClick={() => change(-1)}
          >
            ←
          </button>
          <div className="moda-carousel-tabs">
            {labels.map((label, n) => (
              <button
                key={n}
                type="button"
                aria-label={label}
                aria-pressed={n === current}
                onClick={() => setIndex(n)}
              >
                <span aria-hidden="true">{n + 1}</span>
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
            onClick={() => change(1)}
          >
            →
          </button>
          <button
            type="button"
            className="button button-outline"
            aria-pressed={paused || reduced}
            onClick={() => setPaused((old) => !old)}
            disabled={reduced}
          >
            {paused || reduced ? t("resume") : t("pause")}
          </button>
        </div>
      )}
    </section>
  );
}
