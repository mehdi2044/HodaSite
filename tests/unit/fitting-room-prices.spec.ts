import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FittingRoom } from "@/components/storefront/fitting-room";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
it.each([
  { currency: "USD", locale: "en", expected: "$37.1251" },
  { currency: "CAD", locale: "en", expected: "CA$37.1251" },
  { currency: "TRY", locale: "tr", expected: "₺37,1251" },
  { currency: "IRT", locale: "fa", expected: "۳۷٫۱۲۵۱ تومان" },
] as const)(
  "renders the exact fitting garment price: $currency/$locale",
  ({ currency, locale, expected }) => {
    const ok = async () => ({ ok: true });
    const html = renderToStaticMarkup(
      React.createElement(FittingRoom, {
        customerId: "customer",
        marketId: "market",
        locale,
        currency,
        costCoins: "12.5",
        balance: "0",
        dailyExpires: null,
        models: [
          { id: "woman", label: "Woman", kind: "WOMAN", url: "/model.webp" },
        ],
        products: [
          {
            variantId: "variant",
            productId: "product",
            title: "Garment",
            color: "Color",
            hex: "#000000",
            size: "M",
            gender: "WOMEN",
            slot: "TOP",
            url: "/garment.webp",
            amount: "37.1251",
            owned: false,
            available: true,
          },
        ],
        ownedProducts: [],
        labels: {},
        generate: ok,
        readSession: ok,
        save: ok,
        addToBag: ok,
      }),
    );
    expect(html).toContain(`<p>${expected}</p>`);
  },
);
