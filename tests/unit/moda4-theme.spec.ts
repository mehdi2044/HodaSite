import { expect, it } from "vitest";
import {
  normalizeThemeFonts,
  themeFontVars,
  safeLineOpacity,
  lineOpacity,
  hexColor,
} from "@/lib/theme-validation";
import { contrastRatio } from "@/lib/contrast";
import { MODA4_LIGHT } from "../../scripts/moda4-theme";

it("reads old theme roles compatibly and drops arbitrary font/CSS/URL payloads", () => {
  expect(normalizeThemeFonts({ fa: "Vazirmatn", latin: "Inter" })).toEqual({
    fa: "Vazirmatn",
    latin: "Inter",
    headingLatin: "Manrope",
    priceLatin: "Inter",
  });
  for (const payload of [
    "Inter;}</style><script>alert(1)</script>",
    "url(https://example.com/font)",
    "Caveat",
  ]) {
    expect(
      themeFontVars({
        fa: payload,
        latin: payload,
        headingLatin: payload,
        priceLatin: payload,
      }),
    ).toEqual(themeFontVars(null));
  }
});

it("bounds independent line opacity and retains strict six-digit colors", () => {
  for (const value of [-0.01, 1.01, Infinity, "0.5;display:none"])
    expect(lineOpacity.safeParse(value).success).toBe(false);
  expect(safeLineOpacity({ opacity: { line: "0.5;display:none" } })).toBe(0.12);
  expect(safeLineOpacity({ opacity: { line: 0 } })).toBe(0);
  expect(safeLineOpacity({ opacity: { line: 1 } })).toBe(1);
  expect(hexColor.safeParse("#1412101F").success).toBe(false);
});

it("keeps price/body contrast and corrected kids display colors", () => {
  expect(contrastRatio(MODA4_LIGHT.text, MODA4_LIGHT.primary)).toBeGreaterThan(
    4.5,
  );
  expect(
    contrastRatio(MODA4_LIGHT.primaryText, MODA4_LIGHT.background),
  ).toBeGreaterThan(4.5);
  expect(
    contrastRatio(MODA4_LIGHT.kidsInk, MODA4_LIGHT.kidsPink),
  ).toBeGreaterThan(4.5);
  expect(
    contrastRatio(MODA4_LIGHT.kidsAccent, MODA4_LIGHT.background),
  ).toBeGreaterThan(3);
});
