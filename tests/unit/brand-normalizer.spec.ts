import { describe, it, expect } from "vitest";
import { normalizeBrand } from "@/lib/brand";

describe("normalizeBrand", () => {
  it("passes the current {name,tagline} shape through", () => {
    const shape = {
      name: { fa: "استایل هاب", tr: "STYLE HUB", en: "STYLE HUB" },
      tagline: { fa: "شعار", tr: "Slogan", en: "Tagline" },
    };
    expect(normalizeBrand(shape)).toEqual(shape);
  });

  it("fills in an empty tagline when the current shape omits it", () => {
    const shape = { name: { fa: "a", tr: "b", en: "c" } };
    expect(normalizeBrand(shape)).toEqual({
      name: { fa: "a", tr: "b", en: "c" },
      tagline: { fa: "", tr: "", en: "" },
    });
  });

  it("converts Phase 00's legacy flat {fa,tr,en} shape without losing data", () => {
    const legacy = { fa: "استایل هاب", tr: "STYLE HUB", en: "STYLE HUB" };
    expect(normalizeBrand(legacy)).toEqual({
      name: { fa: "استایل هاب", tr: "STYLE HUB", en: "STYLE HUB" },
      tagline: { fa: "", tr: "", en: "" },
    });
  });

  it("handles null/undefined/empty input", () => {
    const empty = {
      name: { fa: "", tr: "", en: "" },
      tagline: { fa: "", tr: "", en: "" },
    };
    expect(normalizeBrand(null)).toEqual(empty);
    expect(normalizeBrand(undefined)).toEqual(empty);
    expect(normalizeBrand({})).toEqual(empty);
  });
});
