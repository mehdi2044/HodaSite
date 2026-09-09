import { describe, expect, it } from "vitest";
import { buildProductSearchText, normalizeSearchText } from "@/modules/catalog";

describe("catalog search normalization", () => {
  it("normalizes Persian/Arabic letter variants and ZWNJ", () => {
    expect(normalizeSearchText("  كیف‌ زنانه يک  ")).toBe("کیف زنانه یک");
  });

  it("normalizes Persian and Arabic digits", () => {
    expect(normalizeSearchText("سایز ۴۲ و ٤١")).toBe("سایز 42 و 41");
  });

  it("builds the same canonical index form from fields", () => {
    expect(buildProductSearchText(["کت‌ جین", null, "آبی"])).toBe("کت جین آبی");
  });
});
