import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ listCustomers: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/modules/crm", () => ({
  visibleCrmMarkets: async () => [{ id: "market-fixture", code: "TR" }],
  listCustomers: mocks.listCustomers,
}));
vi.mock("@/app/admin/(dashboard)/crm/actions", () => ({
  segmentAction: vi.fn(),
  privacyAction: vi.fn(),
  metricsAction: vi.fn(),
}));
vi.mock("@/app/admin/(dashboard)/crm/preview-action", () => ({
  segmentPreviewAction: vi.fn(),
}));
import CrmPage from "@/app/admin/(dashboard)/crm/page";

describe("CRM customer search pagination", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    // This suite renders the real server page with Vitest's classic JSX transform.
    vi.stubGlobal("React", React);
    mocks.listCustomers.mockReset().mockResolvedValue(
      Array.from({ length: 26 }, (_, i) => ({
        id: `customer-${i}`,
        firstName: "Fixture",
        lastName: "",
        locale: "en",
      })),
    );
  });
  it.each(["مریم & + = ? /", "", "x".repeat(110)])(
    "keeps the effective search and market in both rendered page links (%s)",
    async (search) => {
      const html = renderToStaticMarkup(
        await CrmPage({
          searchParams: Promise.resolve({
            tab: "customers",
            marketId: "market-fixture",
            search,
            page: "1",
          }),
        }),
      );
      const links = [
        ...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(previous|next)<\/a>/g),
      ];
      expect(links).toHaveLength(2);
      for (const [, href, label] of links) {
        const query = new URL(
          href.replaceAll("&amp;", "&"),
          "https://example.com",
        ).searchParams;
        expect(query.get("search") ?? "").toBe(search.slice(0, 100));
        expect(query.get("marketId")).toBe("market-fixture");
        expect(query.get("tab")).toBe("customers");
        expect(query.get("page")).toBe(label === "previous" ? "0" : "2");
        expect([...query.keys()].sort()).toEqual(
          search
            ? ["marketId", "page", "search", "tab"]
            : ["marketId", "page", "tab"],
        );
      }
      expect(mocks.listCustomers).toHaveBeenCalledWith(
        "market-fixture",
        1,
        search.slice(0, 100),
      );
    },
  );
});
