import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Decimal from "decimal.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiscountLines } from "@/components/storefront/discount-lines";
import { computeFees } from "@/modules/fees";
import {
  formatCartAmount,
  formatServiceUnits,
  formatStorefrontAmount,
} from "@/modules/catalog/format";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["74.1354", "CAD", "en", "CA$74.14"],
  ["3.5792", "CAD", "en", "CA$3.58"],
  ["5.8162", "CAD", "en", "CA$5.82"],
  ["74.1349", "CAD", "en", "CA$74.13"],
  ["74.1350", "CAD", "en", "CA$74.14"],
  ["74.1354", "CAD", "tr", "CA$74,14"],
  ["74.1354", "CAD", "fa", "CA$74٫14"],
  ["-1.0050", "CAD", "en", "CA$-1.01"],
  ["99999999999999.9950", "CAD", "en", "CA$100,000,000,000,000.00"],
  ["1120.1251", "TRY", "tr", "₺1.120,13"],
  ["1920000.5", "IRT", "fa", "۱٬۹۲۰٬۰۰۱ تومان"],
] as const)(
  "cash display of %s in %s/%s",
  (amount, currency, locale, expected) => {
    const exact = new Decimal(amount);
    expect(formatCartAmount(exact, currency, locale)).toBe(expected);
    expect(exact.eq(amount)).toBe(true);
  },
);
it("keeps exact quotes and service units independent from cart display", () => {
  const quote = Object.freeze({ total: "74.1354" });
  expect(formatCartAmount(quote.total, "CAD", "en")).toBe("CA$74.14");
  expect(quote.total).toBe("74.1354");
  expect(formatStorefrontAmount(quote.total, "CAD", "en")).toBe("CA$74.1354");
  expect(formatServiceUnits(quote.total, "en")).toBe("74.1354");
});
it("displays the reported CAD cart in cents while the fee engine keeps its exact total", () => {
  const active = {
    priority: 0,
    isActive: true,
    validFrom: new Date("2000-01-01"),
  };
  const quote = computeFees(
    [
      {
        ...active,
        id: "shipping",
        type: "SHIPPING",
        method: "FIXED",
        params: { amount: "20" },
      },
      {
        ...active,
        id: "customs",
        type: "CUSTOMS",
        method: "PERCENT",
        params: { percent: "8", of: "subtotal" },
      },
      {
        ...active,
        id: "tax",
        type: "TAX",
        method: "PERCENT",
        params: { percent: "13", of: "subtotal" },
      },
    ],
    {
      currency: "CAD",
      volumetricDivisor: "5000",
      items: [{ quantity: 1, unitPrice: "44.74", weightGrams: 200 }],
    },
  );
  expect(quote.total).toBe("74.1354");
  expect(formatCartAmount(quote.total, "CAD", "en")).toBe("CA$74.14");
  expect(quote.total).toBe("74.1354");
});
it("rounds cart discount text without changing non-cart consumers or input", () => {
  const lines = [{ title: "Discount", amount: "1.0050" }];
  const props = { lines, currency: "CAD", locale: "en" };
  expect(
    renderToStaticMarkup(
      React.createElement(DiscountLines, { ...props, cartDisplay: true }),
    ),
  ).toContain("CA$1.01");
  expect(
    renderToStaticMarkup(React.createElement(DiscountLines, props)),
  ).toContain("CA$1.005");
  expect(lines[0].amount).toBe("1.0050");
});
