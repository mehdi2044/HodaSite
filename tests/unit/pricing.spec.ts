import { describe, expect, it } from "vitest";
import { calculateDisplayPrice } from "@/modules/pricing";

describe("market pricing", () => {
  it("applies FX, markup and market rounding", () => {
    expect(
      calculateDisplayPrice({
        baseAmount: "10",
        baseCurrency: "USD",
        marketCurrency: "IRT",
        activeRate: "60000",
        markupPercent: "10",
        roundingRule: { mode: "HALF_UP", increment: "1000" },
      }).amount,
    ).toBe("660000");
  });

  it("manual market price wins while preserving exact decimal strings", () => {
    expect(
      calculateDisplayPrice({
        baseAmount: "10",
        baseCurrency: "USD",
        marketCurrency: "CAD",
        activeRate: "1.4",
        markupPercent: "20",
        roundingRule: { mode: "HALF_UP", increment: "0.01" },
        manualAmount: "15.49",
      }).amount,
    ).toBe("15.49");
  });

  it("calculates compare-at prices and lets manual compare-at win", () => {
    const calculated = calculateDisplayPrice({
      baseAmount: "10",
      baseCurrency: "USD",
      marketCurrency: "TRY",
      activeRate: "40",
      markupPercent: "25",
      roundingRule: { mode: "HALF_UP", increment: "1" },
      compareAtBaseAmount: "20",
    });
    expect(calculated).toMatchObject({
      amount: "500",
      compareAtAmount: "1000",
      rate: "40",
    });
    const manual = calculateDisplayPrice({
      baseAmount: "10",
      baseCurrency: "USD",
      marketCurrency: "TRY",
      activeRate: "40",
      markupPercent: "25",
      roundingRule: { mode: "HALF_UP", increment: "1" },
      manualAmount: "450",
      manualCompareAtAmount: "700",
    });
    expect(manual).toMatchObject({ amount: "450", compareAtAmount: "700" });
  });
});
