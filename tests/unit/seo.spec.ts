import { describe, expect, it } from "vitest";
import {
  canonicalOrigin,
  filteredListing,
  normalizeSeo,
  parseSeoPath,
  privateSeoPath,
  seoPath,
  seoSettingsSchema,
  xmlEscape,
} from "@/lib/seo";
describe("SEO URL and indexing contracts", () => {
  it.each([
    "",
    "http://shop.example.com",
    "javascript:alert(1)",
    "https://user:pass@shop.example.com",
    "https://shop.example.com/path",
    "https://shop.example.com/?x=1",
    "https://shop.example.com/#a",
  ])("rejects unsafe or non-origin canonical values %s", (value) => {
    expect(canonicalOrigin(value)).toBeNull();
  });
  it("normalizes a secure origin and remains closed for incomplete settings", () => {
    expect(
      seoSettingsSchema.parse({ origin: " https://SHOP.example.com/ " }).origin,
    ).toBe("https://shop.example.com");
    expect(normalizeSeo({ indexingEnabled: true }).indexingEnabled).toBe(false);
    expect(normalizeSeo(null).indexingEnabled).toBe(false);
    expect(
      normalizeSeo({
        origin: "https://shop.example.com",
        indexingEnabled: true,
      }).indexingEnabled,
    ).toBe(true);
    expect(
      seoSettingsSchema.safeParse({ googleVerification: '<script src="x">' })
        .success,
    ).toBe(false);
  });
  it("round-trips localized public paths without exposing a private rewrite", () => {
    const path = seoPath("fa", "IR", "p", "لباس آبی");
    expect(parseSeoPath(path)).toEqual({
      locale: "fa",
      market: "IR",
      target: `/fa/p/${encodeURIComponent("لباس آبی")}`,
    });
    expect(parseSeoPath("/tr/m/TR")).toEqual({
      locale: "tr",
      market: "TR",
      target: "/tr",
    });
  });
  it.each([
    "/en/m/CA/admin",
    "/fa/m/IR/api/auth",
    "/en/m/CA/cart",
    "/en/m/CA/account",
    "/en/m/CA/p/one/two",
    "/de/m/TR",
    "/en/m/CA/../admin",
  ])("does not rewrite %s", (path) => {
    expect(parseSeoPath(path)).toBeNull();
  });
  it.each([
    "/admin",
    "/admin/login",
    "/api/auth/session",
    "/fa/account",
    "/tr/cart",
    "/en/orders/123",
    "/fa/search",
    "/tr/tracking",
  ])("excludes private or transient route %s", (path) => {
    expect(privateSeoPath(path)).toBe(true);
  });
  it("counts actual facets, excluding tracking, sorting and pagination", () => {
    expect(filteredListing({ brand: "a", color: "blue" })).toBe(true);
    expect(
      filteredListing({
        brand: "a",
        page: "2",
        sort: "price-asc",
        utm_source: "mail",
        market: "TR",
      }),
    ).toBe(false);
    expect(filteredListing({ color: "", size: [] })).toBe(false);
  });
  it("escapes untrusted XML values and removes illegal control characters", () => {
    expect(xmlEscape("a&<b>\"'\u0001")).toBe("a&amp;&lt;b&gt;&quot;&apos;");
  });
});
