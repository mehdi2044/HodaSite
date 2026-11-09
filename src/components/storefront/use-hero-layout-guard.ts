"use client";
/**
 * M4-01 — client layout guard for one hero slide.
 * Port of docs/design/moda4-redesign/m4-01-02/reference/assets/hero-layout.js
 * (layoutHeroSlide). Positions are already correct from CSS projection; this
 * hook only decides what may be SHOWN without colliding:
 *   - label side (away from the copy, flip, ±34px nudge, else collapse)
 *   - pins under the copy / header / controls are hidden
 *   - the float is placed in the gutter beside the person (mode D only)
 *   - the price strip turns on whenever a price is not readable as a label
 * It never moves the copy or the photo, so SSR and hydration render the same
 * composition; only visibility attributes change.
 */
import { useEffect, type RefObject } from "react";
import {
  HERO_GAP,
  grow,
  heroMode,
  intersects,
  within,
  type Rect,
} from "@/modules/content/hero-layout";

function rectOf(el: Element | null, base: DOMRect): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return {
    l: r.left - base.left,
    t: r.top - base.top,
    r: r.right - base.left,
    b: r.bottom - base.top,
  };
}

export function layoutHeroSlide(slide: HTMLElement, stripRequired = false) {
  const win = slide.ownerDocument.defaultView!;
  const base = slide.getBoundingClientRect(),
    W = base.width,
    H = base.height;
  if (!W || !H) return;
  const mode = heroMode(
    win.innerWidth,
    win.matchMedia("(orientation: portrait)").matches,
  );
  const stacked = mode === "A" || mode === "B";
  slide.dataset.strip = stacked || stripRequired ? "on" : "off";
  const copyEl = slide.querySelector("[data-moda4=hero-copy]");
  const copyRaw = rectOf(copyEl, base);
  if (!copyRaw) return;
  const copy = grow(copyRaw, HERO_GAP.copy);
  const header = slide.ownerDocument.querySelector("[data-moda4=header]");
  const headerBottom = header
    ? header.getBoundingClientRect().bottom - base.top
    : 0;
  const headerRect: Rect = { l: 0, t: -9999, r: W, b: headerBottom };
  const controls = rectOf(
    slide
      .closest("[data-moda4=hero]")
      ?.querySelector("[data-moda4=hero-progress]")?.parentElement ?? null,
    base,
  );
  const dock =
    win
      .getComputedStyle(slide)
      .getPropertyValue("--m4-short-desktop")
      .trim() === "1"
      ? rectOf(
          slide.ownerDocument.querySelector(".storefront-floating-nav"),
          base,
        )
      : null;
  const side = slide.dataset.copySide === "left" ? "left" : "right";
  const away = side === "right" ? "left" : "right";
  let needStrip = stacked || stripRequired;
  const placed: Rect[] = [];
  const pins = [
    ...slide.querySelectorAll<HTMLElement>("[data-moda4=hero-pin]"),
  ];
  for (const pin of pins) {
    pin.hidden = false;
    pin.dataset.label = away;
  }
  for (const pin of pins) {
    const dot = rectOf(pin.querySelector(".m4-dot"), base);
    if (!dot) continue;
    const hit = grow(dot, 7); // 44px target
    if (
      intersects(hit, copy) ||
      intersects(hit, headerRect) ||
      intersects(hit, controls) ||
      intersects(hit, dock) ||
      placed.some((p) => intersects(hit, p)) ||
      !within(hit, W, H, HERO_GAP.edge) ||
      (stacked && hit.b > copyRaw.t - 12)
    ) {
      pin.hidden = true;
      needStrip = true;
      continue;
    }
    if (stacked) {
      pin.dataset.label = "none";
      placed.push(grow(dot, HERO_GAP.label));
      continue;
    }
    const tag = pin.querySelector<HTMLElement>(".m4-tag");
    let ok = false;
    const tries: [string, number][] = [
      [away, 0],
      [side, 0],
      [away, -34],
      [away, 34],
      [side, -34],
      [side, 34],
    ];
    for (const [s, dy] of tries) {
      pin.dataset.label = s;
      if (tag) tag.style.marginTop = `${dy}px`;
      const t = rectOf(tag, base);
      if (!t) break;
      const box = grow(t, HERO_GAP.label);
      ok =
        !intersects(box, copy) &&
        !intersects(box, headerRect) &&
        !intersects(box, controls) &&
        !intersects(box, dock) &&
        within(box, W, H, HERO_GAP.edge) &&
        !placed.some((p) => intersects(box, p));
      if (ok) {
        placed.push(box);
        break;
      }
    }
    if (!ok) {
      pin.dataset.label = "none";
      if (tag) tag.style.marginTop = "0px";
      needStrip = true;
    }
    placed.push(grow(dot, HERO_GAP.label));
  }
  const float = slide.querySelector<HTMLElement>("[data-moda4=hero-float]");
  if (float) {
    float.hidden = mode !== "D";
    const subject = rectOf(
      slide.querySelector("[data-moda4=hero-subject]"),
      base,
    );
    if (mode === "D" && subject) {
      const w = float.getBoundingClientRect().width;
      float.style.left = `${Math.round(side === "right" ? subject.r - 0.2 * w : subject.l + 0.2 * w - w)}px`;
      let clash = true;
      for (const y of [0.46, 0.3, 0.58]) {
        float.style.top = `${Math.round(H * y)}px`;
        let f = rectOf(float, base)!;
        const cap = rectOf(float.querySelector(".m4-float-note"), base);
        if (cap)
          f = {
            l: Math.min(f.l, cap.l),
            t: f.t,
            r: Math.max(f.r, cap.r),
            b: Math.max(f.b, cap.b),
          };
        clash =
          intersects(grow(f, HERO_GAP.float - HERO_GAP.copy), copy) ||
          intersects(f, controls) ||
          intersects(f, dock) ||
          !within(f, W, H, HERO_GAP.edge) ||
          placed.some((p) => intersects(f, p));
        if (!clash) break;
      }
      float.hidden = clash;
    }
  }
  if (needStrip && !stripRequired && !stacked) {
    layoutHeroSlide(slide, true);
    return;
  }
  slide.dataset.strip = needStrip ? "on" : "off";
  slide.dataset.mode = mode;
}

/** Re-run on resize, font load, image load and when the slide becomes active. */
export function useHeroLayoutGuard(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  revision: string,
) {
  useEffect(() => {
    const slide = ref.current;
    if (!slide || !active) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => layoutHeroSlide(slide));
    };
    run();
    const observer = new ResizeObserver(run);
    observer.observe(slide);
    const copy = slide.querySelector("[data-moda4=hero-copy]");
    if (copy) observer.observe(copy);
    const dock = document.querySelector(".storefront-floating-nav");
    if (dock) observer.observe(dock);
    document.fonts?.ready.then(run);
    const images = [...slide.querySelectorAll("img")];
    images.forEach((img) => img.addEventListener("load", run));
    addEventListener("resize", run);
    addEventListener("orientationchange", run);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      images.forEach((img) => img.removeEventListener("load", run));
      removeEventListener("resize", run);
      removeEventListener("orientationchange", run);
    };
  }, [ref, active, revision]);
}
