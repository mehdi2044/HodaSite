import { describe, expect, it } from "vitest";
import { homepageBlocksSchema } from "@/modules/content/homepage";

const localized = { fa: "الف", tr: "metin", en: "text" };

describe("homepage composition", () => {
  it("accepts every Phase 01c block and keeps catalog source configuration", () => {
    const result = homepageBlocksSchema.safeParse([
      {
        type: "Hero",
        title: localized,
        body: localized,
        ctaLabel: localized,
        ctaUrl: "/fa/pages/about",
      },
      {
        type: "CategoryCards",
        title: localized,
        source: { mode: "category", referenceId: "future", limit: 4 },
      },
      {
        type: "ProductStrip",
        title: localized,
        source: { mode: "latest", limit: 6 },
      },
      {
        type: "Banner",
        title: localized,
        body: localized,
        ctaLabel: localized,
      },
      { type: "TrustBar", items: [localized] },
      { type: "RichText", text: localized },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects unsafe calls to action and oversized compositions", () => {
    expect(
      homepageBlocksSchema.safeParse([
        {
          type: "Hero",
          title: localized,
          body: localized,
          ctaLabel: localized,
          ctaUrl: "javascript:alert(1)",
        },
      ]).success,
    ).toBe(false);
    expect(
      homepageBlocksSchema.safeParse(
        Array.from({ length: 31 }, () => ({
          type: "RichText",
          text: localized,
        })),
      ).success,
    ).toBe(false);
  });
});
