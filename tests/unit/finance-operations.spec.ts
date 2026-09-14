import { apportion } from "@/modules/finance/apportion";
import {
  allocatedMovementCost,
  costSnapshot,
} from "@/modules/finance/cost-snapshot";
import { describe, it, expect } from "vitest";
import { profitTotals } from "@/modules/finance/profit";
import {
  nextExpenseDate,
  snapshot,
  equivalents,
  purchaseInput,
} from "@/modules/finance/operations-input";
import { allocateLandedCost } from "@/modules/finance/calculations";
const rates = {
  currency: "TRY",
  rateTry: "1",
  rateUsd: "0.025",
  fxAsOf: "2026-01-01T00:00:00Z",
  effectiveAt: "2026-01-01T00:00:00Z",
};
describe("phase06 financial operations", () => {
  it("allocates the contractual 100 piece purchase and preserves fractions", () => {
    expect(
      allocateLandedCost({
        additionalCost: "2000",
        items: [
          {
            id: "a",
            quantity: 100,
            purchaseTotal: "100000",
            allocationWeight: "100000",
          },
        ],
      }),
    ).toEqual([
      {
        id: "a",
        allocatedCost: "2000.0000",
        landedTotal: "102000.0000",
        unitCost: "1020.0000",
        roundingRemainder: "0.0000",
      },
    ]);
    expect(equivalents("1020", rates)).toEqual({
      amountTry: "1020.0000",
      amountUsd: "25.5000",
    });
  });
  it("computes profit after revenue refunds, returned COGS and expense reversals", () => {
    const totals = profitTotals([
      {
        marketId: "tr",
        code: "sales",
        kind: "INCOME",
        amountTry: "-900",
        amountUsd: "-22.5",
      },
      {
        marketId: "tr",
        code: "cogs",
        kind: "EXPENSE",
        amountTry: "540",
        amountUsd: "13.5",
      },
      {
        marketId: "tr",
        code: "expenses",
        kind: "EXPENSE",
        amountTry: "50",
        amountUsd: "1.25",
      },
      {
        marketId: "tr",
        code: "tax_collected",
        kind: "LIABILITY",
        amountTry: "-30",
        amountUsd: "-0.75",
      },
    ]);
    expect(totals).toMatchObject({
      grossTry: "360.0000",
      profitTry: "310.0000",
      profitUsd: "7.7500",
    });
  });
  it("rejects identity-rate errors, negative costs, duplicates and overflow", () => {
    expect(() => snapshot.parse({ ...rates, rateTry: "2" })).toThrow();
    expect(() =>
      equivalents("99999999999999", { rateTry: "100", rateUsd: "1" }),
    ).toThrow("AMOUNT_OVERFLOW");
    const item = {
      variantId: "v",
      quantity: 1,
      purchaseTotal: "100",
      weight: "1",
    };
    const input = {
      marketId: "tr",
      requestKey: "k",
      memo: "test",
      confirm: true,
      snapshot: rates,
      supplierId: "s",
      warehouseId: "w",
      additionalCost: "0",
      allocation: "VALUE",
      items: [item, item],
    };
    expect(() => purchaseInput.parse(input)).toThrow();
    expect(() =>
      purchaseInput.parse({ ...input, additionalCost: "-1", items: [item] }),
    ).toThrow();
  });
});

describe("exact attribution and source FX", () => {
  it("apportions credits and debits without losing the final fractional unit", () => {
    const rows = [
      { id: "c", weight: "1" },
      { id: "a", weight: "1" },
      { id: "b", weight: "1" },
    ];
    expect(apportion("1.0000", rows)).toEqual({
      a: "0.3334",
      b: "0.3333",
      c: "0.3333",
    });
    expect(apportion("-1.0000", rows)).toEqual({
      a: "-0.3334",
      b: "-0.3333",
      c: "-0.3333",
    });
    expect(
      apportion(
        "0.0001",
        rows.map((r) => ({ ...r, weight: "0" })),
      ),
    ).toEqual({ a: "0.0001", b: "0.0000", c: "0.0000" });
    expect(() => apportion("1.00001", rows)).toThrow();
  });
  it("reads the exact purchase snapshot and rejects missing FX rather than inferring a rate", () => {
    const at = new Date("2026-01-02T00:00:00Z");
    expect(
      costSnapshot("TRY", { ...rates, rateUsd: "0.023456789" }, at).rateUsd,
    ).toBe("0.023456789");
    expect(
      costSnapshot(
        "TRY",
        {
          base: "USD",
          originalCurrency: "TRY",
          originalPerUsd: "40",
          tryPerUsd: "40",
          capturedAt: rates.fxAsOf,
        },
        at,
      ).rateUsd,
    ).toBe("0.025000000000");
    expect(() => costSnapshot("TRY", {}, at)).toThrow();
    expect(() => costSnapshot("USD", rates, at)).toThrow();
  });
});

it("conserves landed totals when unit rounding would otherwise lose the entire cost", () => {
  expect(allocatedMovementCost("1", 1000000, 0, -1)).toBe("0.0000");
  expect(allocatedMovementCost("1", 1000000, 0, -999999)).toBe("1.0000");
  expect(allocatedMovementCost("1", 1000000, 999999, -1)).toBe("0.0000");
  expect(allocatedMovementCost("1", 3, 0, -1)).toBe("0.3333");
  expect(allocatedMovementCost("1", 3, 1, -1)).toBe("0.3334");
  expect(allocatedMovementCost("1", 3, 2, -1)).toBe("0.3333");
  expect(allocatedMovementCost("1", 3, 3, 3)).toBe("1.0000");
});

it("clamps recurring expenses at month ends, including leap years", () => {
  expect(
    nextExpenseDate(new Date("2008-01-31T12:00:00Z"), 1).toISOString(),
  ).toBe("2008-02-29T12:00:00.000Z");
  expect(
    nextExpenseDate(new Date("2009-01-31T12:00:00Z"), 1).toISOString(),
  ).toBe("2009-02-28T12:00:00.000Z");
  expect(() => nextExpenseDate(new Date(), 0)).toThrow();
});
