import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  products: vi.fn(),
  prices: vi.fn(),
  singlePrice: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/modules/fitting", () => ({ fittingConfig: mocks.config }));
vi.mock("@/lib/db", () => ({ db: { product: { findMany: mocks.products } } }));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({
    market: { id: "market-ca", code: "CA", currency: "CAD" },
  }),
}));
vi.mock("@/modules/pricing", () => ({
  getDisplayPrices: mocks.prices,
  getDisplayPrice: mocks.singlePrice,
}));
vi.mock("@/modules/catalog", () => ({
  catalogText: (text: Record<string, string>, locale: string) => text[locale],
  formatCatalogCurrency: (amount: string, currency: string) =>
    `${currency} ${amount}`,
}));
import CoinPacksPage from "@/app/[locale]/fitting-room/coins/page";

describe("coin pack listing", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.resetAllMocks();
    mocks.config.mockResolvedValue({ enabled: true, coinSalesEnabled: true });
    mocks.prices.mockResolvedValue(new Map());
  });
  afterEach(() => vi.unstubAllGlobals());
  it("prices a large listing in one batch and retains each pack's price and market", async () => {
    const packs = Array.from({ length: 1000 }, (_, i) => ({
      id: `pack-${i}`,
      coinPackCoins: String((i + 1) * 100),
      titleI18n: { tr: `Pack ${i}` },
      slugI18n: { tr: `pack-${i}` },
      variants: [{ id: `variant-${i}` }],
    }));
    mocks.products.mockResolvedValue(packs);
    mocks.prices.mockResolvedValue(
      new Map(packs.map((p, i) => [p.id, { amount: `${i + 1}.25` }])),
    );
    const html = renderToStaticMarkup(
      await CoinPacksPage({ params: Promise.resolve({ locale: "tr" }) }),
    );
    expect(mocks.prices).toHaveBeenCalledExactlyOnceWith(packs, {
      id: "market-ca",
      code: "CA",
      currency: "CAD",
    });
    expect(mocks.singlePrice).not.toHaveBeenCalled();
    expect(html.match(/<article/g)).toHaveLength(1000);
    expect(html).toContain("CAD 1.25");
    expect(html).toContain("CAD 1000.25");
    expect(html.includes("/tr/m/CA/p/pack-999")).toBe(true);
  });
  it.each([
    { enabled: false, coinSalesEnabled: true },
    { enabled: true, coinSalesEnabled: false },
  ])("keeps unavailable packs out of the listing: %j", async (config) => {
    mocks.config.mockResolvedValue(config);
    const html = renderToStaticMarkup(
      await CoinPacksPage({ params: Promise.resolve({ locale: "tr" }) }),
    );
    expect(mocks.products).not.toHaveBeenCalled();
    expect(mocks.prices).toHaveBeenCalledExactlyOnceWith([], {
      id: "market-ca",
      code: "CA",
      currency: "CAD",
    });
    expect(html).toContain("packsDisabled");
    expect(html).not.toContain("<article");
  });
});
