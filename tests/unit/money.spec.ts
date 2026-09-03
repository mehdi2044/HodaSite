import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { Money, snapshotTotal } from "@/lib/money";

describe("Money gate", () => {
  it("accepts exact strings and Decimal", () => {
    expect(
      new Money("0.1", "USD")
        .add(new Money(new Decimal("0.2"), "USD"))
        .toString(),
    ).toBe("0.3");
  });

  it("subtracts", () =>
    expect(new Money("10", "USD").sub(new Money("3.5", "USD")).toString()).toBe(
      "6.5",
    ));

  it("multiplies by a scalar factor (string or Decimal), full precision", () => {
    expect(new Money("100", "USD").mul("1.2345").toString()).toBe("123.45");
    expect(
      new Money("1500", "TRY").mul(new Decimal("0.0333333")).toString(),
    ).toBe("49.99995");
  });

  it("takes a percentage", () =>
    expect(new Money("200", "USD").percent("8").toString()).toBe("16"));

  it("compares within a currency", () => {
    expect(new Money("1", "USD").compare(new Money("2", "USD"))).toBe(-1);
    expect(new Money("2", "USD").compare(new Money("2", "USD"))).toBe(0);
    expect(new Money("3", "USD").compare(new Money("2", "USD"))).toBe(1);
  });

  it("formats with digit grouping and the currency code", () => {
    expect(new Money("1234567.5", "USD").format()).toBe("1,234,567.50 USD");
    expect(new Money("999", "IRT").format()).toBe("999 IRT");
    expect(new Money("-12000.25", "CAD").format()).toBe("-12,000.25 CAD");
  });

  // --- round(): without an ending -------------------------------------------

  it("rounds to the nearest increment; HALF_UP vs HALF_EVEN decide the half", () => {
    const up = { mode: "HALF_UP", increment: "1000" } as const;
    const even = { mode: "HALF_EVEN", increment: "1000" } as const;
    expect(new Money("12500", "IRT").round(up).toString()).toBe("13000");
    expect(new Money("12500", "IRT").round(even).toString()).toBe("12000");
    // exact half, negative: HALF_UP goes away from zero, HALF_EVEN to even
    expect(new Money("-12500", "IRT").round(up).toString()).toBe("-13000");
    expect(new Money("-12500", "IRT").round(even).toString()).toBe("-12000");
  });

  it.each(["TRY", "CAD"] as const)("rounds %s to two decimals", (c) => {
    expect(
      new Money("12.345", c)
        .round({ mode: "HALF_UP", increment: "0.01" })
        .toString(),
    ).toBe("12.35");
    expect(
      new Money("-12.345", c)
        .round({ mode: "HALF_UP", increment: "0.01" })
        .toString(),
    ).toBe("-12.35");
  });

  // --- round(): with a charm ending ---------------------------------------
  // "nearest value of the form m·increment + ending", mode breaks the tie.

  it("snaps to the nearest .99 charm point", () => {
    const r = { mode: "HALF_UP", increment: "1", ending: "0.99" } as const;
    expect(new Money("13.2", "CAD").round(r).toString()).toBe("12.99"); // closer to 12.99
    expect(new Money("13.7", "CAD").round(r).toString()).toBe("13.99"); // closer to 13.99 (old code gave 12.99)
    expect(new Money("13.99", "CAD").round(r).toString()).toBe("13.99"); // exactly on a charm point
  });

  it("breaks the charm-point tie by mode", () => {
    // 13.49 is exactly between 12.99 and 13.99
    expect(
      new Money("13.49", "CAD")
        .round({ mode: "HALF_UP", increment: "1", ending: "0.99" })
        .toString(),
    ).toBe("13.99");
    expect(
      new Money("13.49", "CAD")
        .round({ mode: "HALF_EVEN", increment: "1", ending: "0.99" })
        .toString(),
    ).toBe("12.99");
  });

  it("supports an ending with a large increment (IRT, ends in 999)", () => {
    const r = { mode: "HALF_UP", increment: "1000", ending: "999" } as const;
    expect(new Money("13200", "IRT").round(r).toString()).toBe("12999");
    expect(new Money("12500", "IRT").round(r).toString()).toBe("12999"); // nearer 12999 than 11999
    expect(new Money("11400", "IRT").round(r).toString()).toBe("10999"); // nearer 10999 than 11999
  });

  it("a non-negative amount never rounds to a negative charm price", () => {
    const r = { mode: "HALF_UP", increment: "1", ending: "0.99" } as const;
    expect(new Money("0.5", "CAD").round(r).toString()).toBe("0.99");
    expect(new Money("0.1", "CAD").round(r).toString()).toBe("0.99");
    expect(new Money("0", "CAD").round(r).toString()).toBe("0.99");
  });

  it("rounds a negative amount to the nearest charm point, no clamping", () =>
    expect(
      new Money("-13.2", "CAD")
        .round({ mode: "HALF_UP", increment: "1", ending: "0.99" })
        .toString(),
    ).toBe("-13.01"));

  it("takes the ending modulo the increment", () =>
    expect(
      new Money("13.2", "CAD")
        .round({ mode: "HALF_UP", increment: "1", ending: "1.99" })
        .toString(),
    ).toBe("12.99"));

  it("rejects currency mixing", () => {
    expect(() => new Money("1", "USD").add(new Money("1", "TRY"))).toThrow();
    expect(() => new Money("1", "USD").sub(new Money("1", "TRY"))).toThrow();
    expect(() =>
      new Money("1", "USD").compare(new Money("1", "TRY")),
    ).toThrow();
  });

  it("does not expose the underlying Decimal", () => {
    const m = new Money("5", "USD") as unknown as Record<string, unknown>;
    expect(m.amount).toBeUndefined();
  });

  it("keeps an immutable order snapshot", () => {
    const quote = {
      base: "USD" as const,
      quote: "CAD" as const,
      rate: "1.25",
      capturedAt: "2026-09-02T00:00:00Z",
    };
    const order = snapshotTotal(new Money("20", "CAD"), quote);
    quote.rate = "2";
    expect(order.fxSnapshot.rate).toBe("1.25");
    expect(Object.isFrozen(order.fxSnapshot)).toBe(true);
  });
});
