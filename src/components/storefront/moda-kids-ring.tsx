"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
export function ModaKidsRing({
  items,
  labels,
}: {
  items: ReactNode[];
  labels: string[];
}) {
  const t = useTranslations("modaHomepage"),
    root = useRef<HTMLDivElement>(null),
    turn = useRef(0),
    drag = useRef<{ x: number; start: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const paint = (angle: number) => {
    turn.current = angle;
    root.current?.style.setProperty("--kids-ring-angle", `${angle}deg`);
  };
  useEffect(() => {
    if (paused || items.length < 2) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false,
      engaged = false,
      frame = 0,
      previous = 0;
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
    });
    if (root.current) observer.observe(root.current);
    const enter = () => {
        engaged = true;
      },
      leave = () => {
        engaged = Boolean(root.current?.contains(document.activeElement));
      };
    const element = root.current;
    element?.addEventListener("mouseenter", enter);
    element?.addEventListener("mouseleave", leave);
    element?.addEventListener("focusin", enter);
    element?.addEventListener("focusout", leave);
    const tick = (time: number) => {
      const delta = previous ? Math.min(100, time - previous) : 0;
      previous = time;
      if (
        visible &&
        !engaged &&
        !document.hidden &&
        !media.matches &&
        !drag.current
      )
        paint(turn.current + delta * 0.007);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element?.removeEventListener("mouseenter", enter);
      element?.removeEventListener("mouseleave", leave);
      element?.removeEventListener("focusin", enter);
      element?.removeEventListener("focusout", leave);
    };
  }, [paused, items.length]);
  return (
    <div className="moda-kids-ring-section">
      <div
        ref={root}
        className="moda-kids-ring-stage"
        onPointerDown={(event) => {
          if ((event.target as Element).closest("a,button")) return;
          drag.current = { x: event.clientX, start: turn.current };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            paint(drag.current.start + (event.clientX - drag.current.x) / 2);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="moda-kids-ring">
          {items.map((item, n) => (
            <div
              key={n}
              className="moda-kids-podium"
              style={
                {
                  "--podium-angle": `${(n * 360) / Math.max(1, items.length)}deg`,
                } as React.CSSProperties
              }
            >
              <div className="moda-kids-billboard" aria-label={labels[n]}>
                {item}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="moda-carousel-controls">
        <button
          type="button"
          className="button button-outline"
          aria-label={t("previous")}
          onClick={() => paint(turn.current - 360 / Math.max(1, items.length))}
        >
          ←
        </button>
        <button
          type="button"
          className="button button-outline"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? t("resume") : t("pause")}
        </button>
        <button
          type="button"
          className="button button-outline"
          aria-label={t("next")}
          onClick={() => paint(turn.current + 360 / Math.max(1, items.length))}
        >
          →
        </button>
      </div>
    </div>
  );
}
