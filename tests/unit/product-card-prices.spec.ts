import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/components/engagement/wishlist", () => ({
  WishlistHeart: () => null,
}));
vi.mock("@/components/storefront/link-pending", () => ({
  LinkPending: () => null,
}));
// This server-rendering test covers the legacy non-interactive card. The
// actual client quick-add/variant branch is covered by moda5-commerce e2e.
vi.mock("@/components/storefront/moda-product-card", () => ({
  ModaProductCard: () => {
    throw Error("Legacy fixture must retain its server card");
  },
}));
vi.mock("@/modules/pricing", () => ({
  getDisplayPrice: () => {
    throw new Error("Provided display price must be reused");
  },
}));
import { ProductCard } from "@/components/storefront/product-card";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
it.each([
  { currency: "USD", locale: "en", expected: "$37.1251" },
  { currency: "CAD", locale: "en", expected: "CA$37.1251" },
  { currency: "TRY", locale: "tr", expected: "₺37,1251" },
  { currency: "IRT", locale: "fa", expected: "۳۷٫۱۲۵۱ تومان" },
] as const)(
  "renders the exact catalog card price: $currency/$locale",
  async ({ currency, locale, expected }) => {
    const html = renderToStaticMarkup(
      await ProductCard({
        locale,
        market: {
          id: "market",
          code: "TR",
          currency,
          markupPercent: { toString: () => "0" },
          roundingRule: { mode: "HALF_UP", increment: "0.0001" },
        },
        product: {
          id: "product",
          slugI18n: { [locale]: "product" },
          titleI18n: { [locale]: "Product" },
          basePriceAmount: { toString: () => "37.1251" },
          compareAtPriceAmount: null,
          variants: [],
          media: [],
          displayPrice: {
            amount: "37.1251",
            compareAtAmount: null,
            currency,
            rate: "1",
          },
        },
      }),
    );
    expect(html).toContain(`>${expected}</p>`);
  },
);
