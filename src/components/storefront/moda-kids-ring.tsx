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
type Rect = { left: number; right: number; top: number; bottom: number };
type MeasuredCard = {
  element: HTMLElement;
  top: number;
  width: number;
  artwork: Rect[];
  label: Rect | undefined;
};
type OrbitLayout = {
  width: number;
  height: number;
  depth: number;
  radius: number;
  cards: MeasuredCard[];
};

function measureCard(element: HTMLElement): MeasuredCard {
  const piece = element.firstElementChild as HTMLElement;
  // Read untransformed layout only on resize, not on every animation frame.
  const measure = (node: HTMLElement): Rect => ({
    left: piece.offsetLeft + node.offsetLeft,
    right: piece.offsetLeft + node.offsetLeft + node.offsetWidth,
    top: piece.offsetTop + node.offsetTop,
    bottom: piece.offsetTop + node.offsetTop + node.offsetHeight,
  });
  const label = piece.querySelector<HTMLElement>(".moda-kids-label");
  return {
    element,
    top: element.offsetTop,
    width: element.offsetWidth,
    artwork: [
      ...piece.querySelectorAll<HTMLElement>(
        ".moda-kids-visual, .moda-kids-base",
      ),
    ].map(measure),
    label: label ? measure(label) : undefined,
  };
}

function overlaps(a: Rect, b: Rect, gap = 0) {
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap
  );
}

function measureOrbit(
  width: number,
  height: number,
  cards: MeasuredCard[],
): OrbitLayout {
  const depth = Math.min(205, width * 0.26);
  const artworkHalf = Math.max(
    0,
    ...cards.flatMap((card) =>
      card.artwork.map(({ left, right }) =>
        Math.max(card.width / 2 - left, right - card.width / 2),
      ),
    ),
  );
  const edge = width / 2 - 3;
  const sideRoom = edge - artworkHalf * 0.82;
  const nearReach = (edge * depth) / perspective + artworkHalf * 0.18;
  // Bound the orbit's reach across all angles, including the extra width
  // projected on approach to the front. Keep the garment scale unchanged.
  const safeRadius =
    sideRoom > nearReach ? Math.sqrt(sideRoom ** 2 - nearReach ** 2) : 0;
  const radius = Math.min(270, width * 0.38, safeRadius);
  return { width, height, depth, radius, cards };
}

function drawOrbit(
  stage: HTMLElement,
  { cards, width, height, depth, radius }: OrbitLayout,
  angle: number,
) {
  if (!width) return;
  stage.style.setProperty("--kids-ring-angle", `${angle}deg`);
  const projected = cards.map(
    ({ element: card, width: cardWidth, top, artwork, label }, index) => {
      const theta = (angle + (index * 360) / cards.length) * radians;
      const frontness = Math.cos(theta);
      const x = Math.sin(theta) * radius;
      const z = frontness * depth;
      const scale = 0.82 + frontness * 0.18;
      const projection = perspective / (perspective - z);
      const center = width / 2 + x * projection;
      const originY = height * 0.2;
      const y = frontness * 12;
      const visualTop = originY + (top + y - originY) * projection;
      const factor = scale * projection;
      const project = (rect: Rect): Rect => ({
        left: center + (rect.left - cardWidth / 2) * factor,
        right: center + (rect.right - cardWidth / 2) * factor,
        top: visualTop + rect.top * factor,
        bottom: visualTop + rect.bottom * factor,
      });
      return {
        card,
        x,
        y,
        z,
        scale,
        frontness,
        artwork: artwork.map(project),
        label: label && project(label),
      };
    },
  );
  const occupied: Rect[] = [];
  const ordered = projected.sort((a, b) => b.frontness - a.frontness);
  for (const [
    index,
    { card, x, y, z, scale, frontness, artwork, label },
  ] of ordered.entries()) {
    // Occlusion of garments is handled by the browser's depth order. Only
    // suppress a label that would be clipped or cross a nearer piece/label.
    const labelVisible = Boolean(
      label &&
      label.left >= 3 &&
      label.right <= width - 3 &&
      label.top >= 0 &&
      label.bottom <= height &&
      !occupied.some((other) => overlaps(label, other, 4)),
    );
    if (labelVisible && label) occupied.push(label);
    occupied.push(...artwork);
    card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) translateX(-50%) scale(${scale})`;
    card.style.zIndex = String(ordered.length - index);
    card.style.setProperty(
      "--kids-depth-opacity",
      String(1 - 0.16 * Math.max(0, -frontness)),
    );
    const state = String(labelVisible);
    if (card.dataset.kidsLabelVisible !== state)
      card.dataset.kidsLabelVisible = state;
  }
}

export function ModaKidsRing({ items }: { items: Card[] }) {
  const t = useTranslations("modaHomepage");
  const stage = useRef<HTMLDivElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
  const turn = useRef(0);
  const step = useRef<{ frame: number; target: number } | null>(null);
  const layout = useRef<OrbitLayout | null>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(
    null,
  );
  const moved = useRef(false);
  const [paused, setPaused] = useState(false);

  const paint = useCallback((angle: number) => {
    turn.current = angle;
    if (stage.current && layout.current)
      drawOrbit(stage.current, layout.current, angle);
  }, []);

  const stopStep = useCallback(() => {
    if (step.current) cancelAnimationFrame(step.current.frame);
    step.current = null;
  }, []);

  const rotate = (direction: number) => {
    const start = turn.current;
    const target =
      (step.current?.target ?? start) + (direction * 360) / items.length;
    stopStep();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(target);
      return;
    }
    const started = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - started) / 420);
      const eased = progress * progress * (3 - 2 * progress);
      paint(start + (target - start) * eased);
      step.current =
        progress < 1 ? { frame: requestAnimationFrame(tick), target } : null;
    };
    step.current = { frame: requestAnimationFrame(tick), target };
  };

  useEffect(() => stopStep, [stopStep]);

  useLayoutEffect(() => {
    const root = stage.current;
    if (!root || !orbit.current) return;
    const cards = [...orbit.current.children] as HTMLElement[];
    const resize = () => {
      const maxCard = Math.max(0, ...cards.map((card) => card.offsetHeight));
      root.style.setProperty(
        "--kids-layout-height",
        `${Math.ceil(maxCard * 1.2 + 48)}px`,
      );
      layout.current = measureOrbit(
        root.clientWidth,
        root.clientHeight,
        cards.map(measureCard),
      );
      paint(turn.current);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    cards.forEach((card) => {
      observer.observe(card);
      const label = card.querySelector(".moda-kids-label");
      if (label) observer.observe(label);
    });
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
      if (!step.current) paint(turn.current + delta * 0.007);
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
            stopStep();
            paint((-Number(target.dataset.kidsIndex) * 360) / items.length);
          }
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          stopStep();
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
              data-kids-label-visible={index === 0}
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
            onClick={() => rotate(-1)}
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
            onClick={() => rotate(1)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
