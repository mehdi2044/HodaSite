import { describe, expect, it } from "vitest";
import { storefrontHref } from "@/modules/content/storefront-links";

describe("CMS storefront destinations", () => {
  it.each(["fa", "tr", "en"] as const)(
    "keeps neutral shopping links in %s",
    (locale) => {
      expect(storefrontHref("/search?q=linen#results", locale)).toBe(
        `/${locale}/search?q=linen#results`,
      );
      expect(storefrontHref("/", locale)).toBe(`/${locale}`);
      expect(storefrontHref("/c/women", locale)).toBe(`/${locale}/c/women`);
    },
  );
  it.each([
    "/tr/search",
    "https://example.com/look",
    "#collection",
    "/admin",
    "/api/health",
    "/searching",
    "mailto:shop@example.com",
  ])("preserves explicit destination %s", (href) => {
    expect(storefrontHref(href, "fa")).toBe(href);
  });
});
