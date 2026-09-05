import { z } from "zod";

// Every one of these guards a value that ends up interpolated into raw CSS
// (a <style dangerouslySetInnerHTML>) or a style= attribute. A value that
// doesn't match its allowlist here must never reach that render path — see
// the P1 finding on PR #4: an unconstrained `radius` string let
// `12px}</style><script>…` break out of the <style> tag on every page.
const CSS_LENGTH_RE = /^(0|\d{1,3}(\.\d{1,2})?(px|rem|em|%))$|^full$/;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export const cssLength = z.string().regex(CSS_LENGTH_RE, "Invalid CSS length");
export const hexColor = z.string().regex(HEX_COLOR_RE, "Invalid hex color");

// heroStyle/font fields aren't rendered into a style context today (heroStyle
// is unused until 01c's homepage builder; fonts.* isn't read back into CSS —
// tokens.css hard-codes the @font-face rules), but they're admin-editable
// free strings that will be as soon as those land, so lock them to the
// options the UI actually offers now rather than leave that landmine.
export const HERO_STYLES = ["editorial", "minimal"] as const;
export const FONT_FA_FAMILIES = ["Vazirmatn"] as const;
export const FONT_LATIN_FAMILIES = ["Inter"] as const;

/**
 * Defense in depth for the RENDER path (RootLayout): re-validate even an
 * already-saved value before building the raw CSS string, instead of trusting
 * that every row in the DB went through saveTheme's Zod schema — a future
 * bug, a direct DB edit, or pre-existing data from before this guard existed
 * must never reach dangerouslySetInnerHTML unchecked.
 */
export function safeCssLength(
  value: string | undefined | null,
  fallback: string,
): string {
  return value && CSS_LENGTH_RE.test(value) ? value : fallback;
}

/** Same defense-in-depth, for a whole { key: hex } color map. Invalid or
 * unexpected entries are dropped rather than merged in. */
export function safeColorMap(
  raw: Record<string, string> | undefined | null,
  defaults: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...defaults };
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && HEX_COLOR_RE.test(v)) out[k] = v;
  }
  return out;
}

export type ThemeColorsShape = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

/**
 * Normalizes ThemeSettings.colors — accepts either the current shape
 * ({light,dark}) or Phase 00's legacy flat palette, so a row that somehow
 * slipped past the data migration
 * (prisma/migrations/20260905010000_phase01a_data_migration_brand_colors)
 * still renders correctly (PR #4 review, P1 — defense in depth at the reader).
 */
export function normalizeThemeColors(raw: unknown): ThemeColorsShape {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (c.light && typeof c.light === "object" && !Array.isArray(c.light)) {
    return {
      light: c.light as Record<string, string>,
      dark: (c.dark as Record<string, string> | undefined) ?? {},
    };
  }
  // Legacy flat palette — the whole object IS the light palette.
  return { light: c as Record<string, string>, dark: {} };
}
