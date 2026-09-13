import { describe, expect, it } from "vitest";
import {
  reconcileOrder,
  type ReconciliationInput,
} from "@/modules/finance/reconciliation";

function fixture(): ReconciliationInput {
  const at = "2006-01-15T12:00:00.000Z";
  return {
    currency: "TRY",
    status: "PAID",
    paidAt: at,
    subtotal: "100.0001",
    fees: "5",
    discount: "10",
    total: "95.0001",
    totalTry: "95.0001",
    totalUsd: "2.3750",
    fxSnapshot: { marketPerUsd: "40", tryPerUsd: "40", quotedAt: at },
    items: [{ amount: "100.0001", currency: "TRY" }],
    feeLines: [
      { amount: "5", currency: "TRY", absorbed: false },
      { amount: "2", currency: "TRY", absorbed: true },
    ],
    payments: [
      {
        id: "cash",
        amount: "60.0001",
        currency: "TRY",
        method: "CASH",
        status: "APPROVED",
        reviewedAt: at,
        reference: "",
      },
      {
        id: "credit",
        amount: "35",
        currency: "TRY",
        method: "STORE_CREDIT",
        status: "APPROVED",
        reviewedAt: at,
        reference: "use",
      },
    ],
    creditUses: [
      { id: "use", amount: "35", currency: "TRY", status: "CONSUMED" },
    ],
    returnActivity: false,
  };
}
describe("read-only order reconciliation", () => {
  it("separates cash, consumed credit, discount and absorbed fees without mutation", () => {
    const input = fixture(),
      original = structuredClone(input),
      result = reconcileOrder(input);
    expect(result.issues).toEqual([]);
    expect(result.totals).toEqual({
      items: "100.0001",
      chargedFees: "5.0000",
      absorbedFees: "2.0000",
      netGoods: "90.0001",
      expected: "95.0001",
      approved: "95.0001",
      external: "60.0001",
      credit: "35.0000",
      other: "0.0000",
      difference: "0.0000",
    });
    expect(result.fx).toMatchObject({
      expectedTry: "95.0001",
      expectedUsd: "2.3750",
      ledgerRateTry: "1.000000000000",
      ledgerRateUsd: "0.025000000000",
    });
    // TRY must not be calculated from the rounded USD value (which would be 95).
    expect(input).toEqual(original);
  });
  it.each(["PENDING", "SUBMITTED", "REJECTED", "VOIDED", "FAILED"])(
    "does not count %s payments",
    (status) => {
      const input = fixture();
      input.payments.push({
        ...input.payments[0],
        id: "ignored",
        amount: "999",
        currency: "USD",
        reviewedAt: null,
        status,
      });
      expect(reconcileOrder(input).issues).toEqual([]);
    },
  );
  it.each([
    ["60", "-0.0001"],
    ["60.0002", "0.0001"],
  ])(
    "preserves the signed four-decimal difference for cash %s",
    (amount, difference) => {
      const input = fixture();
      input.payments[0].amount = amount;
      expect(reconcileOrder(input)).toMatchObject({
        issues: ["PAYMENT_TOTAL"],
        totals: { difference },
      });
    },
  );
  it("never adds foreign-currency evidence to order-currency totals", () => {
    const input = fixture();
    input.payments[0].currency = "USD";
    input.items.push({ amount: "1000", currency: "CAD" });
    input.feeLines.push({ amount: "500", currency: "IRT", absorbed: true });
    const result = reconcileOrder(input);
    expect(result.issues).toEqual(["CURRENCY", "PAYMENT_TOTAL"]);
    expect(result.totals).toMatchObject({
      items: "100.0001",
      absorbedFees: "2.0000",
      approved: "35.0000",
      external: "0.0000",
      difference: "-60.0001",
    });
  });
  it("flags missing payment dates and inconsistent order status", () => {
    const input = fixture();
    input.paidAt = null;
    input.status = "CANCELLED";
    input.payments[0].reviewedAt = null;
    expect(reconcileOrder(input).issues).toEqual([
      "NOT_PAID",
      "ORDER_STATE",
      "PAYMENT_DATE",
    ]);
  });
  it("shows unknown approved methods separately", () => {
    const input = fixture();
    input.payments[0].method = "UNKNOWN";
    expect(reconcileOrder(input)).toMatchObject({
      issues: ["PAYMENT_METHOD"],
      totals: { other: "60.0001", external: "0.0000", difference: "0.0000" },
    });
  });
  it("detects incorrect item/fee/discount totals independently", () => {
    const input = fixture();
    input.items[0].amount = "99";
    input.fees = "6";
    input.discount = "101";
    expect(reconcileOrder(input).issues).toEqual([
      "ITEM_TOTAL",
      "FEE_TOTAL",
      "ORDER_TOTAL",
    ]);
  });
  it.each([
    "missing",
    "duplicate",
    "wrong-reference",
    "wrong-amount",
    "wrong-currency",
    "reserved",
    "released",
  ])("requires one consumed record per credit payment: %s", (problem) => {
    const input = fixture();
    if (problem === "missing") input.creditUses = [];
    if (problem === "duplicate")
      input.payments.push({ ...input.payments[1], id: "duplicate" });
    if (problem === "wrong-reference") input.payments[1].reference = "other";
    if (problem === "wrong-amount") input.creditUses[0].amount = "34.9999";
    if (problem === "wrong-currency") input.creditUses[0].currency = "USD";
    if (problem === "reserved") input.creditUses[0].status = "RESERVED";
    if (problem === "released") input.creditUses[0].status = "RELEASED";
    expect(reconcileOrder(input).issues).toContain("CREDIT_HISTORY");
  });
  it.each([
    {},
    null,
    { marketPerUsd: 40, tryPerUsd: 40 },
    ...["0", "-1", "oops", "1e2", "NaN", "Infinity"].map((rate) => ({
      marketPerUsd: rate,
      tryPerUsd: "40",
      quotedAt: "2006-01-15T00:00:00Z",
    })),
  ])("handles malformed quotes without throwing: %j", (fxSnapshot) => {
    expect(reconcileOrder({ ...fixture(), fxSnapshot })).toMatchObject({
      issues: ["FX_MISSING"],
      fx: null,
    });
  });
  it("detects currency identity and saved equivalent mismatches", () => {
    const input = fixture();
    input.fxSnapshot = {
      marketPerUsd: "20",
      tryPerUsd: "40",
      quotedAt: input.paidAt,
    };
    expect(reconcileOrder(input).issues).toEqual(["FX_IDENTITY", "FX_TOTAL"]);
  });
  it("flags loss from a 12-decimal inverse even when original snapshots agree", () => {
    const input = fixture();
    Object.assign(input, {
      currency: "CAD",
      subtotal: "900000000000",
      total: "900000000000",
      totalTry: "12000000000000",
      totalUsd: "300000000000",
      discount: "0",
      fees: "0",
      feeLines: [],
      creditUses: [],
      fxSnapshot: {
        marketPerUsd: "3",
        tryPerUsd: "40",
        quotedAt: input.paidAt,
      },
    });
    input.items = [{ amount: input.total, currency: "CAD" }];
    input.payments = [
      { ...input.payments[0], amount: input.total, currency: "CAD" },
    ];
    const result = reconcileOrder(input);
    expect(result.issues).toEqual(["FX_PRECISION"]);
    expect(result.fx).toMatchObject({
      expectedTry: "12000000000000.0000",
      expectedUsd: "300000000000.0000",
      ledgerRateUsd: "0.333333333333",
    });
  });
  it("keeps sub-cent accuracy beyond the Number safe-integer range", () => {
    const input = fixture();
    Object.assign(input, {
      currency: "USD",
      subtotal: "99999999999999.9999",
      total: "99999999999999.9999",
      totalTry: "99999999999999.9999",
      totalUsd: "99999999999999.9999",
      discount: "0",
      fees: "0",
      feeLines: [],
      creditUses: [],
      fxSnapshot: { marketPerUsd: "1", tryPerUsd: "1", quotedAt: input.paidAt },
    });
    input.items = [
      { amount: "99999999999999", currency: "USD" },
      { amount: "0.9999", currency: "USD" },
    ];
    input.payments = [
      { ...input.payments[0], amount: input.total, currency: "USD" },
    ];
    expect(reconcileOrder(input)).toMatchObject({
      issues: [],
      totals: {
        items: input.total,
        approved: input.total,
        difference: "0.0000",
      },
    });
  });
  it("requires separate return review without netting the original payment", () => {
    const result = reconcileOrder({
      ...fixture(),
      returnActivity: true,
      status: "REFUNDED",
    });
    expect(result).toMatchObject({
      issues: ["RETURN_ACTIVITY"],
      totals: { approved: "95.0001" },
    });
  });
  it.each([12.5, "-1", "1e2", "0.00001", "100000000000000", null])(
    "rejects invalid amounts: %j",
    (total) => {
      expect(reconcileOrder({ ...fixture(), total })).toEqual({
        issues: ["INVALID_DATA"],
        totals: null,
        fx: null,
      });
    },
  );
});
