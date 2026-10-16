"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import type { KIDS_TONES } from "@/modules/catalog/category-presentation";
export function KidsMotionCard({
  children,
  tone,
}: {
  children: ReactNode;
  tone: (typeof KIDS_TONES)[number];
}) {
  const t = useTranslations("cutouts");
  const root = useRef<HTMLDivElement>(null),
    angle = useRef(0),
    drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const [automatic, setAutomatic] = useState(false);
  const paint = (value: number) => {
    angle.current = Math.max(-30, Math.min(30, value));
    root.current?.style.setProperty("--kids-angle", `${angle.current}deg`);
  };
  useEffect(() => {
    if (!automatic) return;
    let visible = false,
      focused = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
    });
    if (root.current) observer.observe(root.current);
    const enter = () => {
        focused = true;
      },
      leave = () => {
        focused = false;
      };
    root.current?.addEventListener("focusin", enter);
    root.current?.addEventListener("focusout", leave);
    let frame = 0,
      previous = 0,
      progress = 0;
    const tick = (time: number) => {
      const delta = previous ? Math.min(100, time - previous) : 0;
      previous = time;
      if (
        visible &&
        !focused &&
        !document.hidden &&
        !reduced.matches &&
        !drag.current
      ) {
        progress += delta;
        paint(Math.sin(progress / 1300) * 15);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const element = root.current;
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element?.removeEventListener("focusin", enter);
      element?.removeEventListener("focusout", leave);
    };
  }, [automatic]);
  return (
    <div
      ref={root}
      className="kids-motion-card min-w-0"
      data-kids-tone={tone}
      style={{ "--kids-card-tone": `var(--${tone})` } as CSSProperties}
      onPointerDown={(event) => {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest(".shop-card-image")
        )
          return;
        drag.current = { x: event.clientX, start: angle.current, moved: false };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const delta = event.clientX - drag.current.x;
        drag.current.moved ||= Math.abs(delta) > 6;
        paint(drag.current.start + delta / 4);
      }}
      onPointerUp={() => {
        if (drag.current?.moved) setAutomatic(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onClickCapture={(event) => {
        if (
          drag.current?.moved &&
          event.target instanceof Element &&
          event.target.closest("a")
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
        drag.current = null;
      }}
    >
      {children}
      <details className="kids-motion-tools">
        <summary aria-label={t("angleControls")}>↻</summary>
        <div
          className="kids-turntable-controls flex flex-wrap gap-2 mt-2"
          aria-label={t("angleControls")}
        >
          <button
            type="button"
            className="button"
            aria-label={t("angleLeft")}
            onClick={() => {
              setAutomatic(false);
              paint(angle.current - 10);
            }}
          >
            ↶
          </button>
          <button
            type="button"
            className="button"
            aria-label={t("angleRight")}
            onClick={() => {
              setAutomatic(false);
              paint(angle.current + 10);
            }}
          >
            ↷
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={automatic}
            onClick={() => setAutomatic((value) => !value)}
          >
            {t(automatic ? "pauseMotion" : "startMotion")}
          </button>
        </div>
      </details>
    </div>
  );
}
