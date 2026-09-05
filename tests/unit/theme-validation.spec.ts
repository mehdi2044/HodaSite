import { describe, it, expect } from "vitest";
import {
  cssLength,
  hexColor,
  safeCssLength,
  safeColorMap,
} from "@/lib/theme-validation";

describe("cssLength", () => {
  it("accepts plain CSS lengths and the full token", () => {
    for (const v of ["12px", "0", "1.5rem", "100%", "999px", "full"]) {
      expect(cssLength.safeParse(v).success).toBe(true);
    }
  });

  it("rejects a style-breakout payload (Phase 01a PR review, P1)", () => {
    const payload = "12px}</style><script>alert(1)</script><style>";
    expect(cssLength.safeParse(payload).success).toBe(false);
  });

  it("rejects other non-length garbage", () => {
    for (const v of [
      "",
      "12",
      "px",
      "12 px",
      "12px;color:red",
      "<b>12px</b>",
    ]) {
      expect(cssLength.safeParse(v).success).toBe(false);
    }
  });
});

describe("hexColor", () => {
  it("accepts 6-digit hex, case-insensitive", () => {
    expect(hexColor.safeParse("#E8792A").success).toBe(true);
    expect(hexColor.safeParse("#e8792a").success).toBe(true);
  });

  it("rejects a style-breakout payload", () => {
    expect(
      hexColor.safeParse("#fff}</style><script>alert(1)</script>").success,
    ).toBe(false);
  });
});

describe("safeCssLength (render-time defense in depth)", () => {
  it("passes through a valid value", () => {
    expect(safeCssLength("10px", "12px")).toBe("10px");
  });

  it("falls back to the default for anything already-invalid in the DB", () => {
    expect(
      safeCssLength("12px}</style><script>alert(1)</script>", "12px"),
    ).toBe("12px");
    expect(safeCssLength(undefined, "12px")).toBe("12px");
    expect(safeCssLength(null, "12px")).toBe("12px");
  });
});

describe("safeColorMap (render-time defense in depth)", () => {
  it("merges valid overrides onto the defaults", () => {
    const out = safeColorMap(
      { primary: "#000000" },
      { primary: "#ffffff", muted: "#888888" },
    );
    expect(out).toEqual({ primary: "#000000", muted: "#888888" });
  });

  it("drops an invalid entry instead of merging it in", () => {
    const out = safeColorMap(
      { primary: "red}</style><script>alert(1)</script>" },
      { primary: "#ffffff" },
    );
    expect(out).toEqual({ primary: "#ffffff" });
  });

  it("returns the defaults untouched when raw is missing", () => {
    expect(safeColorMap(undefined, { primary: "#ffffff" })).toEqual({
      primary: "#ffffff",
    });
  });
});
