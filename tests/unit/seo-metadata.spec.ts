import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  seo: {} as Record<string, unknown>,
  markets: [
    {
      id: "ir",
      code: "IR",
      isActive: true,
      enabledLocales: ["fa", "tr", "en"],
      seo: {},
    },
    {
      id: "tr",
      code: "TR",
      isActive: true,
      enabledLocales: ["tr", "en"],
      seo: {},
    },
    { id: "ca", code: "CA", isActive: false, enabledLocales: ["en"], seo: {} },
  ],
}));
vi.mock("@/modules/settings", () => ({
  getSiteSettings: async () => ({
    seo: state.seo,
    brand: { name: { fa: "نمونه", tr: "Demo", en: "Demo" } },
  }),
  getMarkets: async () => state.markets,
}));
vi.mock("@/lib/db", () => ({ db: {} }));
import { publicMetadata } from "@/modules/seo";
beforeEach(() => {
  state.seo = { origin: "https://shop.example.com", indexingEnabled: true };
});
describe("market-specific search metadata", () => {
  const input = {
    locale: "tr" as const,
    marketId: "tr",
    kind: "p" as const,
    slugs: { fa: "لباس", tr: "elbise", en: "dress" },
    marketIds: ["tr", "ir"],
  };
  it("lists only active visible markets with an available locale and exact slug", async () => {
    const result = await publicMetadata(input);
    expect(result.alternates?.canonical).toBe(
      "https://shop.example.com/tr/m/TR/p/elbise",
    );
    expect(Object.keys(result.alternates?.languages ?? {})).toEqual([
      "fa-IR",
      "tr-IR",
      "en-IR",
      "tr-TR",
      "en-TR",
    ]);
    expect(result.alternates?.languages?.["tr-TR"]).toBe(
      result.alternates?.canonical,
    );
  });
  it("does not invent missing translations or market visibility", async () => {
    const result = await publicMetadata({
      ...input,
      slugs: { tr: "elbise" },
      marketIds: ["tr"],
    });
    expect(result.alternates?.languages).toEqual({
      "tr-TR": "https://shop.example.com/tr/m/TR/p/elbise",
    });
  });
  it("keeps preview/filtered results noindex even when global indexing is enabled", async () => {
    expect((await publicMetadata({ ...input, noindex: true })).robots).toEqual({
      index: false,
      follow: true,
    });
    state.seo = {};
    const result = await publicMetadata(input);
    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.alternates).toBeUndefined();
  });
  it("preserves pagination without claiming equivalent pages across markets", async () => {
    const result = await publicMetadata({ ...input, kind: "c", page: 2 });
    expect(result.alternates).toEqual({
      canonical: "https://shop.example.com/tr/m/TR/c/elbise?page=2",
      languages: {},
    });
  });
  it("preserves an indexable single facet and its pagination in the canonical", async () => {
    const result = await publicMetadata({
      ...input,
      kind: "c",
      facetQuery: "brand=example",
      page: 2,
    });
    expect(result.alternates).toEqual({
      canonical:
        "https://shop.example.com/tr/m/TR/c/elbise?brand=example&page=2",
      languages: {},
    });
    expect(result.robots).toEqual({ index: true, follow: true });
  });
});
