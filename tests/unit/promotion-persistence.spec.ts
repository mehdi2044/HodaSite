import { describe, expect, it } from "vitest";
import {
  couponCodeSchema,
  couponCodesSchema,
  issueCouponsSchema,
  requestHash,
} from "@/modules/promotions/persistence-contracts";
import {
  couponCodesInputSchema,
  MAX_COUPON_INPUT_LENGTH,
} from "@/modules/promotions/coupon-contracts";

describe("promotion persistent input boundaries", () => {
  it.each([32, 64])(
    "accepts 100 codes of length %i and saved comma-space input",
    (length) => {
      const codes = Array.from({ length: 100 }, (_, i) =>
        `code-${String(i).padStart(3, "0")}`.padEnd(length, "a"),
      );
      for (const separator of [",", ", ", " ", "\n"])
        expect(couponCodesInputSchema.parse(codes.join(separator))).toEqual(
          codes.map((code) => code.toUpperCase()),
        );
      const saved = couponCodesInputSchema.parse(codes.join(", ")).join(", ");
      expect(saved.length).toBeLessThanOrEqual(MAX_COUPON_INPUT_LENGTH);
      expect(couponCodesInputSchema.parse(saved)).toHaveLength(100);
    },
  );
  it("rejects too many, duplicate, malformed and overlong coupon input", () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `CODE-${i}`);
    for (const input of [
      tooMany.join(","),
      "code-1, CODE-1",
      "CODE/1",
      "A".repeat(65),
      " ".repeat(MAX_COUPON_INPUT_LENGTH + 1),
    ])
      expect(couponCodesInputSchema.safeParse(input).success).toBe(false);
    expect(couponCodesInputSchema.parse(" \n, ")).toEqual([]);
  });
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
