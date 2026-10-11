import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
vi.mock("@/components/storefront/commerce-form", () => ({
  CommerceForm: ({ children }: { children: React.ReactNode }) =>
    createElement("form", null, children),
}));
import {
  ShopLookStudio,
  type StudioLabels,
} from "@/components/storefront/shop-look-studio";
const media = {
  url: "/fixture.webp",
  variants: [],
  width: 60,
  height: 90,
  blurDataUrl: null,
  altI18n: { en: "Fixture" },
};
it.each([
  { currency: "USD", locale: "en", expected: "$37.1251" },
  { currency: "CAD", locale: "en", expected: "CA$37.1251" },
  { currency: "TRY", locale: "tr", expected: "₺37,1251" },
  { currency: "IRT", locale: "fa", expected: "۳۷٫۱۲۵۱ تومان" },
] as const)(
  "renders the actual piece price without losing quote precision: $currency/$locale",
  ({ currency, locale, expected }) => {
    const html = renderToStaticMarkup(
      createElement(ShopLookStudio, {
        title: "Fixture",
        body: "Fixture",
        locale,
        currency,
        labels: Object.fromEntries(
          [
            "eyebrow",
            "chooseLook",
            "pieces",
            "size",
            "chooseSize",
            "unavailable",
            "details",
            "subtotal",
            "addLook",
            "chooseSizes",
            "emptySelection",
            "completeImage",
            "demo",
            "inBag",
          ].map((k) => [k, k]),
        ) as StudioLabels,
        action: async () => ({ ok: true }),
        looks: [
          {
            id: "fixture",
            label: "Fixture",
            categoryId: "fixture",
            media,
            items: [
              {
                productId: "piece",
                title: "Piece",
                href: "/en/p/piece",
                colorName: "Color",
                colorHex: "#000000",
                media,
                variants: [
                  { id: "variant", size: "M", amount: "37.1251", available: 1 },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(html).toContain(
      `<span class="look-piece-price" dir="ltr">${expected}</span>`,
    );
  },
);
