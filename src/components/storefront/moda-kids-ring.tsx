"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

const perspective = 1300;
const radians = Math.PI / 180;

type Card = { id: string; content: ReactNode };
type MeasuredCard = { element: HTMLElement; width: number };

function drawOrbit(
  stage: HTMLElement,
  cards: MeasuredCard[],
  width: number,
  angle: number,
) {
  if (!width) return;
  stage.style.setProperty("--kids-ring-angle", `${angle}deg`);
  const radius = Math.min(270, width * 0.38);
  const depth = Math.min(205, width * 0.26);
  const projected = cards.map(({ element: card, width: cardWidth }, index) => {
    const theta = (angle + (index * 360) / cards.length) * radians;
    const frontness = Math.cos(theta);
    const x = Math.sin(theta) * radius;
    const z = frontness * depth;
    const scale = 0.82 + frontness * 0.18;
    const projection = perspective / (perspective - z);
    const center = width / 2 + x * projection;
    const half = (cardWidth * scale * projection) / 2;
    return {
      card,
      x,
      z,
      scale,
      frontness,
      left: center - half,
      right: center + half,
    };
  });
  const occupied: { left: number; right: number }[] = [];
  for (const { card, x, z, scale, frontness, left, right } of projected.sort(
    (a, b) => b.frontness - a.frontness,
  )) {
    // The front card wins. Pieces that pass behind another take their turn
    // instead of obscuring a readable price or becoming hidden click targets.
    const visible =
      left >= 3 &&
      right <= width - 3 &&
      !occupied.some(
        (other) => left < other.right + 10 && right > other.left - 10,
      );
    if (visible) occupied.push({ left, right });
    card.style.transform = `translate3d(${x}px, ${frontness * 12}px, ${z}px) translateX(-50%) scale(${scale})`;
    card.style.zIndex = String(Math.round(frontness * 100) + 100);
    card.dataset.kidsVisible = String(visible);
    card.dataset.kidsRear = String(frontness < -0.16);
  }
}

export function ModaKidsRing({ items }: { items: Card[] }) {
  const t = useTranslations("modaHomepage");
  const stage = useRef<HTMLDivElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
  const turn = useRef(0);
  const layout = useRef<{ width: number; cards: MeasuredCard[] }>({
    width: 0,
    cards: [],
  });
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(
    null,
  );
  const moved = useRef(false);
  const [paused, setPaused] = useState(false);

  const paint = useCallback((angle: number) => {
    turn.current = angle;
    if (stage.current)
      drawOrbit(
        stage.current,
        layout.current.cards,
        layout.current.width,
        angle,
      );
  }, []);

  useLayoutEffect(() => {
    const root = stage.current;
    if (!root || !orbit.current) return;
    const cards = [...orbit.current.children] as HTMLElement[];
    const resize = () => {
      layout.current = {
        width: root.clientWidth,
        cards: cards.map((element) => ({
          element,
          width: element.offsetWidth,
        })),
      };
      const maxCard = Math.max(0, ...cards.map((card) => card.offsetHeight));
      root.style.setProperty(
        "--kids-layout-height",
        `${Math.ceil(maxCard * 1.2 + 48)}px`,
      );
      paint(turn.current);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items, paint]);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false,
      hovered = false,
      frame = 0,
      previous = 0;
    const root = stage.current;
    const running = () =>
      visible &&
      !hovered &&
      !root?.contains(document.activeElement) &&
      !document.hidden &&
      !media.matches &&
      !drag.current;
    const sync = () => {
      if (!running()) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
      } else if (!frame) frame = requestAnimationFrame(tick);
    };
    const tick = (time: number) => {
      frame = 0;
      if (!running()) {
        previous = 0;
        return;
      }
      const delta = previous ? Math.min(100, time - previous) : 0;
      previous = time;
      paint(turn.current + delta * 0.007);
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    });
    if (root) observer.observe(root);
    const enter = () => {
      hovered = true;
      sync();
    };
    const leave = () => {
      hovered = false;
      sync();
    };
    const resume = () => queueMicrotask(sync);
    root?.addEventListener("mouseenter", enter);
    root?.addEventListener("mouseleave", leave);
    root?.addEventListener("focusin", resume);
    root?.addEventListener("focusout", resume);
    root?.addEventListener("pointerup", resume);
    root?.addEventListener("pointercancel", resume);
    document.addEventListener("visibilitychange", sync);
    media.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root?.removeEventListener("mouseenter", enter);
      root?.removeEventListener("mouseleave", leave);
      root?.removeEventListener("focusin", resume);
      root?.removeEventListener("focusout", resume);
      root?.removeEventListener("pointerup", resume);
      root?.removeEventListener("pointercancel", resume);
      document.removeEventListener("visibilitychange", sync);
      media.removeEventListener("change", sync);
    };
  }, [paused, items.length, paint]);

  return (
    <div className="moda-kids-ring-section">
      <div
        ref={stage}
        className="moda-kids-ring-stage"
        data-moda4="kids-turntable"
        onFocusCapture={(event) => {
          const target = event.target.closest<HTMLElement>("[data-kids-index]");
          if (target && event.target.matches(":focus-visible")) {
            paint((-Number(target.dataset.kidsIndex) * 360) / items.length);
          }
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          moved.current = false;
          drag.current = {
            x: event.clientX,
            start: turn.current,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const point = drag.current;
          if (!point) return;
          const delta = event.clientX - point.x;
          if (!point.moved && Math.abs(delta) < 8) return;
          if (!point.moved) {
            point.moved = true;
            moved.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          paint(point.start + delta / 2);
        }}
        onPointerLeave={() => {
          if (!drag.current?.moved) drag.current = null;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          moved.current = false;
        }}
        onClickCapture={(event) => {
          if (moved.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
            moved.current = false;
          }
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        <div ref={orbit} className="moda-kids-ring">
          {items.map(({ id, content }, index) => (
            <div
              key={id}
              className="moda-kids-podium"
              data-moda4="kids-turntable-item"
              data-kids-index={index}
              data-kids-visible={index === 0}
            >
              {content}
            </div>
          ))}
        </div>
      </div>
      <p className="moda-kids-hint">{t("kidsTapPiece")}</p>
      {items.length > 1 && (
        <div className="moda-carousel-controls">
          <button
            type="button"
            className="button button-outline"
            aria-label={t("previous")}
            onClick={() => paint(turn.current - 360 / items.length)}
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
            onClick={() => paint(turn.current + 360 / items.length)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
