import { describe, expect, it } from "vitest";
import {
  couponCodeSchema,
  couponCodesSchema,
  issueCouponsSchema,
  requestHash,
} from "@/modules/promotions/persistence-contracts";

describe("promotion persistent input boundaries", () => {
  it("normalizes ASCII codes and rejects duplicates after normalization", () => {
    expect(couponCodeSchema.parse(" welcome-10 ")).toBe("WELCOME-10");
    expect(couponCodesSchema.parse(["zzzz", "aaaa"])).toEqual(["AAAA", "ZZZZ"]);
    expect(() => couponCodesSchema.parse(["abcd", " ABCD "])).toThrow();
  });
  it.each(["", "abc", "کد-تخفیف", "A B C", "A/B/C", "A".repeat(65)])(
    "rejects ambiguous/unbounded code %s",
    (code) => {
      expect(() => couponCodeSchema.parse(code)).toThrow();
    },
  );
  it("bounds batches and requires explicit confirmation", () => {
    const input = {
      programId: "p",
      marketId: "m",
      mutationKey: "73d9902f-089e-4ac7-b028-574d88ca6f9f",
      confirmed: true,
      codes: ["ABCD"],
      generateCount: 0,
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: null,
      totalUsageCap: 1,
      perCustomerCap: 1,
    };
    expect(issueCouponsSchema.parse(input).codes).toEqual(["ABCD"]);
    for (const change of [
      { confirmed: false },
      { generateCount: 101 },
      { generateCount: 1 },
      { codes: [] },
      { totalUsageCap: -1 },
      { endsAt: input.startsAt },
      { sql: "DROP TABLE" },
    ])
      expect(() => issueCouponsSchema.parse({ ...input, ...change })).toThrow();
  });
  it("canonical retry hash preserves meaning across object key order", () => {
    expect(requestHash({ a: "1.0001", b: { c: 1, d: 2 } })).toBe(
      requestHash({ b: { d: 2, c: 1 }, a: "1.0001" }),
    );
    expect(requestHash({ amount: "1.0001" })).not.toBe(
      requestHash({ amount: "1.0002" }),
    );
    expect(requestHash({ actorId: "a" })).not.toBe(
      requestHash({ actorId: "b" }),
    );
  });
});
