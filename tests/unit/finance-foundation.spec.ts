import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  allocateLandedCost,
  reverseJournal,
  validateJournal,
} from "@/modules/finance/calculations";
const pair = [
  {
    accountId: "bank",
    currency: "TRY",
    original: { debit: "102000", credit: "0" },
    functional: { debit: "102000", credit: "0" },
    reporting: { debit: "2550", credit: "0" },
  },
  {
    accountId: "capital",
    currency: "TRY",
    original: { debit: "0", credit: "102000" },
    functional: { debit: "0", credit: "102000" },
    reporting: { debit: "0", credit: "2550" },
  },
];
describe("finance foundation", () => {
  it("validates original/TRY/USD balance and reverses frozen values exactly", () => {
    expect(validateJournal(pair)).toEqual(pair);
    expect(reverseJournal(reverseJournal(pair))).toEqual(pair);
  });
  it("rejects differences in any currency and refuses cross-currency netting", () => {
    for (const field of ["original", "functional", "reporting"] as const) {
      const changed = structuredClone(pair);
      changed[1][field].credit = "1";
      expect(() => validateJournal(changed)).toThrow("UNBALANCED_JOURNAL");
    }
    const mixed = structuredClone(pair);
    mixed[1].currency = "USD";
    expect(() => validateJournal(mixed)).toThrow("UNBALANCED_JOURNAL");
  });
  it("rejects non-finite, excessive precision, negative and overlapping sides", () => {
    for (const debit of [
      "NaN",
      "Infinity",
      "-1",
      "1.00001",
      "100000000000000",
    ]) {
      const changed = structuredClone(pair);
      changed[0].original.debit = debit;
      expect(() => validateJournal(changed)).toThrow();
    }
    const changed = structuredClone(pair);
    changed[0].original.credit = "1";
    expect(() => validateJournal(changed)).toThrow();
  });
  it("100 units at 1000 TRY plus 2000 TRY inbound cost gives 1020 TRY per unit", () => {
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
  });
  it("conserves allocations and unit-cost remainders, independent of input order", () => {
    const items = ["a", "b", "c"].map((id) => ({
      id,
      quantity: 3,
      purchaseTotal: "1",
      allocationWeight: "1",
    }));
    const result = allocateLandedCost({ additionalCost: "0.01", items });
    expect(result.map((r) => r.allocatedCost)).toEqual([
      "0.0034",
      "0.0033",
      "0.0033",
    ]);
    expect(
      result
        .reduce((s, r) => s.add(r.allocatedCost), new Decimal(0))
        .toString(),
    ).toBe("0.01");
    for (const r of result)
      expect(
        new Decimal(r.unitCost).mul(3).add(r.roundingRemainder).toFixed(4),
      ).toBe(r.landedTotal);
    expect(
      allocateLandedCost({
        additionalCost: "0.01",
        items: items.reverse(),
      }).sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(result);
  });
  it("rejects duplicate IDs and zero allocation weights", () => {
    const item = {
      id: "a",
      quantity: 1,
      purchaseTotal: "10",
      allocationWeight: "1",
    };
    expect(() =>
      allocateLandedCost({ additionalCost: "1", items: [item, item] }),
    ).toThrow("DUPLICATE_ITEM");
    expect(() =>
      allocateLandedCost({
        additionalCost: "1",
        items: [{ ...item, allocationWeight: "0" }],
      }),
    ).toThrow();
  });
});
