import { describe, expect, it } from "vitest";
import { marketInputSchema } from "@/modules/settings/market-validation";

const base = {
  marketId: "market-1",
  defaultLocale: "fa",
  enabledLocales: ["fa"],
};

describe("market announcement link", () => {
  it("accepts a relative or HTTPS link", () => {
    expect(
      marketInputSchema.safeParse({
        ...base,
        announcementLink: "/fa/pages/about",
      }).success,
    ).toBe(true);
    expect(
      marketInputSchema.safeParse({
        ...base,
        announcementLink: "https://example.com",
      }).success,
    ).toBe(true);
  });
  it("rejects executable, insecure and protocol-relative links", () => {
    for (const announcementLink of [
      "javascript:alert(1)",
      "http://example.com",
      "//example.com",
    ])
      expect(
        marketInputSchema.safeParse({ ...base, announcementLink }).success,
      ).toBe(false);
  });
});
