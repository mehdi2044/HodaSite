import { describe, it, expect } from "vitest";
import { normalizeThemeColors } from "@/lib/theme-validation";

describe("normalizeThemeColors", () => {
  it("passes the current {light,dark} shape through", () => {
    const shape = {
      light: { primary: "#e8792a", background: "#fbf8f3" },
      dark: { primary: "#f0955a", background: "#171310" },
    };
    expect(normalizeThemeColors(shape)).toEqual(shape);
  });

  it("fills in an empty dark palette when the current shape omits it", () => {
    const shape = { light: { primary: "#e8792a" } };
    expect(normalizeThemeColors(shape)).toEqual({
      light: { primary: "#e8792a" },
      dark: {},
    });
  });

  it("converts Phase 00's legacy flat palette without losing data", () => {
    const legacy = {
      primary: "#e8792a",
      background: "#fbf8f3",
      surface: "#ffffff",
      text: "#1a1a1a",
      muted: "#6b6b6b",
    };
    expect(normalizeThemeColors(legacy)).toEqual({ light: legacy, dark: {} });
  });

  it("handles null/undefined/empty input", () => {
    expect(normalizeThemeColors(null)).toEqual({ light: {}, dark: {} });
    expect(normalizeThemeColors(undefined)).toEqual({ light: {}, dark: {} });
    expect(normalizeThemeColors({})).toEqual({ light: {}, dark: {} });
  });
});
