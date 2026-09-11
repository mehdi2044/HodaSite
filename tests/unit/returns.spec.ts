import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { describe, it, expect } from "vitest";
import {
  returnAmount,
  returnLineBudgets,
  returnRequestSchema,
} from "@/modules/returns/validation";
describe("return net merchandise budgets", () => {
  it("allocates discount exactly at four decimals, independently of input ordering", () => {
    const lines = [
      { id: "c", lineTotalAmount: "1" },
      { id: "a", lineTotalAmount: "1" },
      { id: "b", lineTotalAmount: "1" },
    ];
    const result = returnLineBudgets(lines, "1");
    expect([...result.values()].map((n) => n.toFixed())).toEqual([
      "0.6666",
      "0.6667",
      "0.6667",
    ]);
    expect([...returnLineBudgets([...lines].reverse(), "1")]).toEqual([
      ...result,
    ]);
  });
  it("preserves large numeric(18,4) values without binary floats", () => {
    expect(
      returnLineBudgets(
        [{ id: "a", lineTotalAmount: "99999999999999.9999" }],
        "0.0001",
      )
        .get("a")!
        .toFixed(),
    ).toBe("99999999999999.9998");
  });
  it("refunds the final rounding remainder and releases rejected claims", () => {
    let money = new Decimal(0);
    for (let claimed = 0; claimed < 3; claimed++)
      money = money.add(returnAmount("1", 3, claimed, money, 1));
    expect(money.toFixed()).toBe("1");
    expect(returnAmount("1", 3, 1, "0.3334", 2).toFixed()).toBe("0.6666");
  });
  it("conserves each budget for every sequential unit return across differing quantities", () => {
    for (let sold = 1; sold <= 80; sold++)
      for (const budget of ["0", "0.0001", "1.2345", "10000000.0001"]) {
        let allocated = new Decimal(0);
        for (let i = 0; i < sold; i++)
          allocated = allocated.add(
            returnAmount(budget, sold, i, allocated, 1),
          );
        expect(allocated.toFixed()).toBe(new Decimal(budget).toFixed());
      }
  });
  it.each([
    [2, 1, 2],
    [2, 0, 0],
    [2, -1, 1],
    [2, 0, 1.5],
  ])("rejects invalid quantities %s/%s/%s", (sold, claimed, quantity) =>
    expect(() => returnAmount("10", sold, claimed, "0", quantity)).toThrow(),
  );
  it("rejects negative or excessive discounts and previously over-refunded budgets", () => {
    for (const discount of ["-1", "11"])
      expect(() =>
        returnLineBudgets([{ id: "x", lineTotalAmount: "10" }], discount),
      ).toThrow();
    expect(() => returnAmount("1", 2, 1, "2", 1)).toThrow();
  });
  it("rejects duplicate lines and inconsistent exchange choices", () => {
    const v = {
      orderId: "order",
      requestKey: randomUUID(),
      type: "RETURN",
      reasonCode: "SIZE",
      items: [{ orderItemId: "line", quantity: 1 }],
    };
    expect(returnRequestSchema.safeParse(v).success).toBe(true);
    expect(
      returnRequestSchema.safeParse({ ...v, items: [...v.items, ...v.items] })
        .success,
    ).toBe(false);
    expect(
      returnRequestSchema.safeParse({ ...v, type: "EXCHANGE" }).success,
    ).toBe(false);
    expect(
      returnRequestSchema.safeParse({
        ...v,
        items: [{ ...v.items[0], exchangeVariantId: "v2" }],
      }).success,
    ).toBe(false);
  });
});
