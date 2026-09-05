import { describe, it, expect } from "vitest";
import { sanitizeCustomCss, CustomCssError } from "@/lib/custom-css";

describe("sanitizeCustomCss", () => {
  it("accepts plain, harmless CSS", () => {
    const css = ".hero { color: red; border-radius: 4px; }";
    expect(sanitizeCustomCss(css)).toBe(css);
  });

  it("rejects @import (acceptance criterion 5)", () => {
    expect(() =>
      sanitizeCustomCss('@import url("https://evil.example/x.css");'),
    ).toThrow(CustomCssError);
  });

  it("rejects url() pointing at an external host", () => {
    expect(() =>
      sanitizeCustomCss(".x { background: url(https://evil.example/x.png); }"),
    ).toThrow(CustomCssError);
    expect(() =>
      sanitizeCustomCss(".x { background: url('//evil.example/x.png'); }"),
    ).toThrow(CustomCssError);
  });

  it("allows a local/relative url()", () => {
    const css = ".x { background: url(/media/a.png); }";
    expect(sanitizeCustomCss(css)).toBe(css);
  });

  it("rejects expression() and markup", () => {
    expect(() =>
      sanitizeCustomCss(".x { width: expression(alert(1)); }"),
    ).toThrow(CustomCssError);
    expect(() => sanitizeCustomCss("<script>alert(1)</script>")).toThrow(
      CustomCssError,
    );
  });

  it("rejects payloads over the size cap", () => {
    const huge = ".x{}" + "/* padding */".repeat(2000);
    expect(() => sanitizeCustomCss(huge)).toThrow(CustomCssError);
  });

  it("trims and allows an empty value", () => {
    expect(sanitizeCustomCss("   ")).toBe("");
  });
});
