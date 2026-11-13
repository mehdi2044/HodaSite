/**
 * M4-01 — Hero composition geometry (pure, server/client/test safe).
 *
 * Physical rule: a hero slide's copy sits on the photo's EMPTY side
 * (`copySide: "left" | "right"`), independent of the page direction. The
 * photo is never mirrored. Text alignment still follows the language.
 *
 * The same numbers drive CSS (container-query projection, see
 * src/styles/moda-hero.css) and the client guard (use-hero-layout-guard.ts),
 * so what the admin previews, what the customer sees and what the tests
 * measure are one computation.
 */
import type { HeroFraming } from "./hero-framing";
export type HeroCopySide = "left" | "right";
export type HeroLayout = {
  copySide: HeroCopySide;
  framing?: HeroFraming;
  /** Horizontal extent of the person in the DESKTOP image, 0..1 of its width. */
  subject: { x0: number; x1: number };
};
export type HeroMode = "A" | "B" | "C" | "D";
/** A ≤760 · B 761–1099 portrait · C 761–1279 landscape · D ≥1280. */
export const HERO_MEDIA = {
  stacked:
    "(max-width:760px), (min-width:761px) and (max-width:1099px) and (orientation:portrait)",
  floats: "(min-width:1280px)",
} as const;
export function heroMode(width: number, portrait: boolean): HeroMode {
  if (width <= 760) return "A";
  if (width <= 1099 && portrait) return "B";
  if (width <= 1279) return "C";
  return "D";
}

/**
 * Backward compatible read of stored slides. Existing content only has the
 * logical `textSide`; it was authored for the Persian (RTL) storefront, where
 * "start" meant the right-hand side of the photo.
 */
export function normalizeHeroLayout(slide: {
  textSide?: "start" | "end";
  layout?: Partial<HeroLayout> | null;
}): HeroLayout {
  const copySide: HeroCopySide =
    slide.layout?.copySide ?? (slide.textSide === "end" ? "left" : "right");
  const fallback =
    copySide === "right" ? { x0: 0.18, x1: 0.42 } : { x0: 0.58, x1: 0.82 };
  const s = slide.layout?.subject;
  const subject =
    s && s.x1 > s.x0 && s.x0 >= 0 && s.x1 <= 1
      ? { x0: s.x0, x1: s.x1 }
      : fallback;
  return {
    copySide,
    subject,
    ...(slide.layout?.framing ? { framing: slide.layout.framing } : {}),
  };
}

/** Desktop object-position x that keeps the subject on its own half. */
export function heroFocalX(layout: HeroLayout) {
  const centre = (layout.subject.x0 + layout.subject.x1) / 2;
  // copy on the right → keep the subject left of centre, and vice versa
  return layout.copySide === "right"
    ? Math.min(0.5, Math.max(0, centre))
    : Math.max(0.5, Math.min(1, centre));
}

/** object-fit: cover projection of an image point into a box (pixels). */
export function projectCover(
  point: { x: number; y: number },
  image: { width: number; height: number },
  box: { width: number; height: number },
  focal: { x: number; y: number },
) {
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const rw = image.width * scale,
    rh = image.height * scale;
  return {
    x: (box.width - rw) * focal.x + point.x * rw,
    y: (box.height - rh) * focal.y + point.y * rh,
  };
}

export type Rect = { l: number; t: number; r: number; b: number };
export const grow = (a: Rect, d: number): Rect => ({
  l: a.l - d,
  t: a.t - d,
  r: a.r + d,
  b: a.b + d,
});
export const intersects = (a: Rect | null, b: Rect | null) =>
  !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
export const within = (a: Rect, w: number, h: number, m = 0) =>
  a.l >= m && a.t >= m && a.r <= w - m && a.b <= h - m;

export const HERO_GAP = { copy: 16, label: 6, edge: 8, float: 24 } as const;

/** Rule ids are shared with tests/fidelity/hero-audit.js and the admin preview. */
export type HeroViolation =
  | "H-01" // copy overlaps the person (side-by-side modes)
  | "H-02" // copy outside hero / under header / over controls
  | "H-03" // title clipped, too small, or wrong weight
  | "H-04" // a visible pin or label collides
  | "H-05" // float outside mode D or colliding
  | "H-06" // a garment price is not readable anywhere on the slide
  | "H-07"; // CTA clipped or below 44px

export function heroViolations(input: {
  mode: HeroMode;
  width: number;
  height: number;
  copy: Rect;
  subject: Rect;
  header: Rect;
  controls: Rect | null;
  title: { clipped: boolean; fontSize: number; weight: string };
  pins: { dot: Rect | null; label: Rect | null }[];
  float: Rect | null;
  strip: { visible: boolean; items: number; clipped: boolean };
  ctas: Rect[];
}): HeroViolation[] {
  const v = new Set<HeroViolation>();
  const { width: W, height: H, copy, mode } = input;
  const stacked = mode === "A" || mode === "B";
  if (!stacked && intersects(grow(copy, HERO_GAP.copy), input.subject))
    v.add("H-01");
  if (
    !within(copy, W, H) ||
    intersects(copy, input.header) ||
    intersects(copy, input.controls)
  )
    v.add("H-02");
  if (
    input.title.clipped ||
    input.title.fontSize < (mode === "A" ? 40 : 52) ||
    input.title.weight !== "400"
  )
    v.add("H-03");
  const placed: Rect[] = [];
  let labelled = 0;
  for (const pin of input.pins) {
    for (const box of [pin.dot, pin.label]) {
      if (!box) continue;
      if (
        intersects(box, copy) ||
        intersects(box, input.header) ||
        intersects(box, input.controls) ||
        !within(box, W, H) ||
        placed.some((p) => intersects(box, p))
      )
        v.add("H-04");
      placed.push(box);
    }
    if (pin.label) labelled++;
  }
  if (input.float) {
    if (
      mode !== "D" ||
      !within(input.float, W, H, HERO_GAP.edge) ||
      intersects(grow(input.float, HERO_GAP.float), copy) ||
      intersects(input.float, input.controls) ||
      placed.some((p) => intersects(input.float!, p))
    )
      v.add("H-05");
  }
  if (labelled < input.pins.length && !input.strip.visible) v.add("H-06");
  if (
    input.strip.visible &&
    (input.strip.items !== input.pins.length || input.strip.clipped)
  )
    v.add("H-06");
  for (const cta of input.ctas)
    if (!within(cta, W, H) || cta.b - cta.t < 44) v.add("H-07");
  return [...v];
}

/**
 * Display headings contrast by weight (400 / 300), never italics (D77).
 * Admin may mark the light part with "|" ("From the rail|to you.");
 * otherwise the last word is light ("City Layers" → "City" + "Layers").
 */
export function splitDisplayTitle(title: string): {
  strong: string;
  light: string;
} {
  const clean = title.trim();
  if (clean.includes("|")) {
    const [strong, ...light] = clean.split("|");
    return { strong: strong.trim(), light: light.join(" ").trim() };
  }
  const words = clean.split(/\s+/);
  if (words.length < 2) return { strong: clean, light: "" };
  return {
    strong: words.slice(0, -1).join(" "),
    light: words[words.length - 1],
  };
}
/** Plain text for aria-label / alt: the "|" marker is never shown. */
export const displayTitleText = (title: string) =>
  title.replace(/\s*\|\s*/g, " ").trim();
