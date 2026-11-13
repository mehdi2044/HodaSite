import { expect, it } from "vitest";
import { sameFittingMarket } from "@/modules/fitting/market-context";

const page = { marketId: "market-tr", currency: "TRY", locale: "tr" };
it("accepts only responses for the page's full verified context", () => {
  expect(sameFittingMarket(page, { ...page })).toBe(true);
  expect(sameFittingMarket(page, { ...page, marketId: "market-ir" })).toBe(
    false,
  );
  expect(sameFittingMarket(page, { ...page, currency: "IRT" })).toBe(false);
  expect(sameFittingMarket(page, { ...page, locale: "en" })).toBe(false);
});
