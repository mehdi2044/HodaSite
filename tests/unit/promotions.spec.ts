import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  evaluatePromotions,
  promotionRevisionSchema,
  type PromotionContext,
  type PromotionRevision,
} from "@/modules/promotions";

function promotion(
  overrides: Partial<PromotionRevision> = {},
): PromotionRevision {
  return {
    id: "promo",
    revision: 1,
    marketId: "ca",
    currency: "CAD",
    enabled: true,
    status: "ACTIVE",
    startsAt: "2026-10-01T00:00:00Z",
    endsAt: null,
    priority: 0,
    group: "default",
    stacking: "STACKABLE",
    excludes: [],
    couponRequired: false,
    totalUsageCap: null,
    perCustomerCap: null,
    budget: null,
    definition: {
      version: 1,
      conditions: [],
      maxDiscount: null,
      selector: {
        productIds: [],
        categoryIds: [],
        collectionIds: [],
        excludedProductIds: [],
        excludedCategoryIds: [],
        excludedCollectionIds: [],
      },
      effect: { type: "percent", percent: "10" },
    },
    ...overrides,
  };
}
function context(overrides: Partial<PromotionContext> = {}): PromotionContext {
  return {
    marketId: "ca",
    currency: "CAD",
    locale: "en",
    now: "2026-10-03T12:00:00Z",
    items: [
      {
        variantId: "v1",
        productId: "p1",
        categoryId: "clothing",
        collectionIds: ["autumn"],
        quantity: 2,
        unitPrice: "50",
      },
    ],
    shippingAmount: "12",
    customer: null,
    verifiedCoupons: [],
    usage: [],
    ...overrides,
  };
}
function customer(): NonNullable<PromotionContext["customer"]> {
  return {
    id: "c1",
    marketId: "ca",
    orderCount: 0,
    segmentIds: ["new"],
    tags: ["vip"],
    consents: {
      email: "OPTED_IN",
      sms: "UNKNOWN",
      whatsapp: "OPTED_OUT",
      telegram: "UNKNOWN",
      push: "UNKNOWN",
    },
  };
}
function usage() {
  return {
    promotionId: "promo",
    revision: 1,
    totalUsed: 0,
    customerId: "c1",
    customerUsed: 0,
    spent: "0",
  };
}
const result = (p: PromotionRevision, ctx = context()) =>
  evaluatePromotions([p], ctx);
const reason = (p: PromotionRevision, ctx = context()) =>
  result(p, ctx).explanations[0].reason;

describe("09B offline promotion contract", () => {
  it("applies CA + minimum basket and rejects another market", () => {
    const p = promotion();
    p.definition.conditions = [{ field: "subtotal", op: "gte", value: "100" }];
    expect(result(p).discountTotal).toBe("10.0000");
    expect(reason(p, context({ marketId: "tr" }))).toBe("MARKET_MISMATCH");
    const ctx = context();
    ctx.items[0].quantity = 1;
    expect(reason(p, ctx)).toBe("CONDITIONS_UNMET");
  });
  it.each(["DRAFT", "STAGED", "PAUSED", "ARCHIVED"] as const)(
    "does not activate %s",
    (status) => {
      expect(reason(promotion({ status }))).toBe("INACTIVE");
    },
  );
  it("requires enabled even for scheduled revisions", () => {
    expect(reason(promotion({ enabled: false, status: "SCHEDULED" }))).toBe(
      "DISABLED",
    );
    expect(reason(promotion({ status: "SCHEDULED" }))).toBe("APPLIED");
  });
  it("uses inclusive start, exclusive end and explicit time", () => {
    const p = promotion({
      startsAt: "2026-10-03T12:00:00Z",
      endsAt: "2026-10-04T00:00:00Z",
    });
    expect(reason(p)).toBe("APPLIED");
    expect(reason(p, context({ now: "2026-10-03T11:59:59Z" }))).toBe(
      "OUTSIDE_WINDOW",
    );
    expect(reason(p, context({ now: p.endsAt! }))).toBe("OUTSIDE_WINDOW");
  });
  it("never converts fixed benefits across currencies", () => {
    expect(reason(promotion({ currency: "USD" }))).toBe("CURRENCY_MISMATCH");
  });
  it.each([
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "0.00001",
    "100000000000000",
    " 1",
    "01",
  ])("rejects unsafe money %s", (value) => {
    const ctx = context();
    ctx.items[0].unitPrice = value;
    expect(() => evaluatePromotions([], ctx)).toThrow();
  });
  it("rejects numeric money, unknown versions/effects/fields and executable rules", () => {
    const p = promotion();
    expect(() =>
      promotionRevisionSchema.parse({
        ...p,
        definition: { ...p.definition, version: 2 },
      }),
    ).toThrow();
    expect(() =>
      promotionRevisionSchema.parse({ ...p, sql: "select true" }),
    ).toThrow();
    for (const effect of [
      { type: "fixed", amount: 10 },
      { type: "script", code: "alert(1)" },
      { type: "percent", percent: "100.0001" },
    ]) {
      expect(() =>
        promotionRevisionSchema.parse({
          ...p,
          definition: { ...p.definition, effect },
        }),
      ).toThrow();
    }
  });
  it("rejects duplicate revisions, variants and usage evidence", () => {
    expect(() =>
      evaluatePromotions([promotion(), promotion()], context()),
    ).toThrow();
    const ctx = context();
    ctx.items.push({ ...ctx.items[0] });
    expect(() => evaluatePromotions([], ctx)).toThrow();
    expect(() =>
      evaluatePromotions([], context({ usage: [usage(), usage()] })),
    ).toThrow();
  });
  it("rejects invalid dates/window, fractional quantity and aggregate overflow", () => {
    expect(() =>
      result(promotion({ endsAt: "2026-09-01T00:00:00Z" })),
    ).toThrow();
    expect(() =>
      result(promotion(), context({ now: "2026-02-30T12:00:00Z" })),
    ).toThrow();
    const ctx = context();
    ctx.items[0].quantity = 1.5;
    expect(() => evaluatePromotions([], ctx)).toThrow();
    ctx.items[0].quantity = 2;
    ctx.items[0].unitPrice = "99999999999999.9999";
    expect(() => evaluatePromotions([], ctx)).toThrow("numeric(18,4)");
  });
  it("bounds combined merchandise and shipping before exposing snapshot amounts", () => {
    const ctx = context();
    ctx.items[0].quantity = 1;
    ctx.items[0].unitPrice = "99999999999999.9999";
    expect(() => result(promotion(), ctx)).toThrow("numeric(18,4)");
    ctx.shippingAmount = "0";
    expect(result(promotion(), ctx).subtotal).toBe("99999999999999.9999");
  });
  it("does not treat unknown customers/order evidence as a first order", () => {
    const p = promotion();
    p.definition.conditions = [{ field: "orders", op: "eq", value: 0 }];
    expect(reason(p)).toBe("CONDITIONS_UNMET");
    expect(
      reason(p, context({ customer: { ...customer(), orderCount: null } })),
    ).toBe("CONDITIONS_UNMET");
    expect(reason(p, context({ customer: customer() }))).toBe("APPLIED");
  });
  it("rejects cross-market customer evidence even with matching segments", () => {
    expect(() =>
      result(
        promotion(),
        context({ customer: { ...customer(), marketId: "tr" } }),
      ),
    ).toThrow("another market");
  });
  it.each([
    { field: "market", value: "ca" },
    { field: "locale", value: "en" },
    { field: "segment", value: "new" },
    { field: "tag", value: "vip" },
    { field: "orders", op: "lte", value: 0 },
    { field: "subtotal", op: "eq", value: "100" },
    { field: "quantity", op: "gte", value: 2 },
    { field: "product", value: "p1" },
    { field: "category", value: "clothing" },
    { field: "collection", value: "autumn" },
    { field: "consent", channel: "email", value: "OPTED_IN" },
  ] as PromotionRevision["definition"]["conditions"])(
    "explains matching condition %j",
    (condition) => {
      const p = promotion();
      p.definition.conditions = [condition];
      const r = result(p, context({ customer: customer() }));
      expect(r.explanations[0]).toMatchObject({
        reason: "APPLIED",
        conditions: [{ field: condition.field, matched: true }],
      });
    },
  );
  it("requires ALL conditions and reports every mismatch", () => {
    const p = promotion();
    p.definition.conditions = [
      { field: "locale", value: "fa" },
      { field: "segment", value: "missing" },
    ];
    const r = result(p, context({ customer: customer() }));
    expect(r.explanations[0].conditions.map((c) => c.matched)).toEqual([
      false,
      false,
    ]);
    expect(r.lines).toEqual([]);
  });
  it("does not promote absent consent to opted-in or guest to unknown consent", () => {
    const p = promotion();
    p.definition.conditions = [
      { field: "consent", channel: "sms", value: "OPTED_IN" },
    ];
    expect(reason(p, context({ customer: customer() }))).toBe(
      "CONDITIONS_UNMET",
    );
    p.definition.conditions[0] = {
      field: "consent",
      channel: "sms",
      value: "UNKNOWN",
    };
    expect(reason(p)).toBe("CONDITIONS_UNMET");
  });
  it("requires validated coupon evidence for the exact promotion revision", () => {
    const p = promotion({ couponRequired: true });
    for (const verifiedCoupons of [
      [],
      [{ promotionId: "other", revision: 1 }],
      [{ promotionId: "promo", revision: 2 }],
    ]) {
      expect(reason(p, context({ verifiedCoupons }))).toBe("COUPON_REQUIRED");
    }
    expect(
      reason(
        p,
        context({ verifiedCoupons: [{ promotionId: "promo", revision: 1 }] }),
      ),
    ).toBe("APPLIED");
  });
});

describe("09B deterministic allocation and stacking", () => {
  it("selects by priority regardless of input order, ties by ID", () => {
    const a = promotion({ id: "a", stacking: "EXCLUSIVE_GROUP" });
    const b = promotion({ id: "b", priority: 1 });
    expect(evaluatePromotions([a, b], context())).toEqual(
      evaluatePromotions([b, a], context()),
    );
    expect(evaluatePromotions([a, b], context()).lines[0].promotionId).toBe(
      "b",
    );
    b.priority = 0;
    expect(evaluatePromotions([b, a], context()).lines[0].promotionId).toBe(
      "a",
    );
  });
  it.each([true, false])(
    "explicit exclusion works from either side: %s",
    (forward) => {
      const a = promotion({ id: "a", excludes: forward ? ["b"] : [] });
      const b = promotion({
        id: "b",
        group: "different",
        excludes: forward ? [] : ["a"],
      });
      const r = evaluatePromotions([b, a], context());
      expect(r.explanations[1]).toMatchObject({
        reason: "CONFLICT",
        conflictWith: "a",
      });
    },
  );
  it("does not let zero benefit claim an exclusive group", () => {
    const a = promotion({ id: "a", stacking: "EXCLUSIVE_GROUP" });
    a.definition.selector.productIds = ["absent"];
    const r = evaluatePromotions([a, promotion({ id: "b" })], context());
    expect(r.lines[0].promotionId).toBe("b");
    expect(r.explanations[0].reason).toBe("NO_BENEFIT");
  });
  it("compounds stackable percentages on remaining amounts without mutating prices", () => {
    const ctx = context();
    const before = JSON.stringify(ctx);
    const r = evaluatePromotions(
      [promotion({ id: "a" }), promotion({ id: "b" })],
      ctx,
    );
    expect(r.lines.map((l) => l.amount)).toEqual(["10.0000", "9.0000"]);
    expect(r.discountedSubtotal).toBe("81.0000");
    expect(JSON.stringify(ctx)).toBe(before);
  });
  it("does not change original subtotal eligibility after an earlier discount", () => {
    const p = promotion({ id: "b" });
    p.definition.conditions = [{ field: "subtotal", op: "gte", value: "100" }];
    expect(
      evaluatePromotions([p, promotion({ id: "a" })], context()).lines,
    ).toHaveLength(2);
  });
  it("allocates rounding remainders stably and exactly", () => {
    const p = promotion();
    p.definition.effect = { type: "fixed", amount: "1" };
    const ctx = context();
    ctx.items = ["c", "a", "b"].map((variantId) => ({
      ...ctx.items[0],
      variantId,
      quantity: 1,
      unitPrice: "1",
    }));
    const r = result(p, ctx);
    expect(r.lines[0].allocations).toEqual([
      { variantId: "a", amount: "0.3334" },
      { variantId: "b", amount: "0.3333" },
      { variantId: "c", amount: "0.3333" },
    ]);
    expect(result(p, { ...ctx, items: [...ctx.items].reverse() })).toEqual(r);
  });
  it("caps fixed benefit to eligible items, preserving excluded and unrelated lines", () => {
    const p = promotion();
    p.definition.effect = { type: "fixed", amount: "200" };
    p.definition.selector.productIds = ["p1"];
    const ctx = context();
    ctx.items.push({
      ...ctx.items[0],
      variantId: "v2",
      productId: "p2",
      quantity: 1,
      unitPrice: "200",
    });
    const r = result(p, ctx);
    expect(r.merchandiseDiscount).toBe("100.0000");
    expect(r.discountedSubtotal).toBe("200.0000");
    expect(r.lines[0].allocations).toEqual([
      { variantId: "v1", amount: "100.0000" },
    ]);
  });
  it.each(["Product", "Category", "Collection"] as const)(
    "exclusions win for %s",
    (kind) => {
      const p = promotion();
      if (kind === "Product") p.definition.selector.excludedProductIds = ["p1"];
      if (kind === "Category")
        p.definition.selector.excludedCategoryIds = ["clothing"];
      if (kind === "Collection")
        p.definition.selector.excludedCollectionIds = ["autumn"];
      expect(reason(p)).toBe("NO_BENEFIT");
    },
  );
  it("ANDs populated selector dimensions", () => {
    const p = promotion();
    p.definition.selector.productIds = ["p1"];
    p.definition.selector.categoryIds = ["wrong"];
    expect(reason(p)).toBe("NO_BENEFIT");
  });
  it("caps free shipping to charged shipping once, never merchandise", () => {
    const p = promotion();
    p.definition.effect = { type: "freeShipping" };
    const r = evaluatePromotions([p, { ...p, id: "second" }], context());
    expect(r.discountTotal).toBe("12.0000");
    expect(r.merchandiseDiscount).toBe("0.0000");
    expect(r.shippingRemaining).toBe("0.0000");
    expect(r.lines).toHaveLength(1);
    expect(reason(p, context({ shippingAmount: "0" }))).toBe("NO_BENEFIT");
  });
  it("keeps allocations nonnegative across a fixed discount followed by multi-buy", () => {
    const a = promotion({ id: "a" });
    a.definition.effect = { type: "fixed", amount: "2.9999" };
    const b = promotion({ id: "b" });
    b.definition.effect = { type: "buyXGetY", buy: 2, get: 1 };
    const ctx = context();
    ctx.items[0].quantity = 3;
    ctx.items[0].unitPrice = "1";
    const r = evaluatePromotions([a, b], ctx);
    expect(r.discountedSubtotal).toBe("0.0001");
    expect(r.explanations[1].reason).toBe("NO_BENEFIT");
  });
  it("honors configured max discount", () => {
    const p = promotion();
    p.definition.maxDiscount = "2.1234";
    expect(result(p).discountTotal).toBe("2.1234");
  });
  it("keeps high-precision money exact and does not reconfigure global Decimal", () => {
    const before = Decimal.precision;
    const ctx = context();
    ctx.items[0].unitPrice = "9999999999999.9999";
    const p = promotion();
    p.definition.effect = { type: "fixed", amount: "0.0001" };
    const r = result(p, ctx);
    expect(r.subtotal).toBe("19999999999999.9998");
    expect(r.discountedSubtotal).toBe("19999999999999.9997");
    expect(Decimal.precision).toBe(before);
  });
  it("does not round a sub-quantum benefit up to a charge it did not earn", () => {
    const ctx = context();
    ctx.items[0].unitPrice = "0.0001";
    ctx.items[0].quantity = 1;
    expect(reason(promotion(), ctx)).toBe("NO_BENEFIT");
  });
  it("conserves allocations and never creates a negative line over many decimal cases", () => {
    for (let n = 1; n <= 30; n++) {
      const ctx = context();
      ctx.items = Array.from({ length: n }, (_, i) => ({
        ...ctx.items[0],
        variantId: `v${i}`,
        unitPrice: `${i + 1}.0001`,
        quantity: 1,
      }));
      const p = promotion();
      p.definition.effect = { type: "fixed", amount: "3.0001" };
      const r = evaluatePromotions([p, promotion({ id: "second" })], ctx);
      const allocated = new Map<string, Decimal>();
      for (const l of r.lines) {
        expect(
          l.allocations
            .reduce((a, x) => a.add(x.amount), new Decimal(0))
            .eq(l.amount),
        ).toBe(true);
        for (const x of l.allocations)
          allocated.set(
            x.variantId,
            (allocated.get(x.variantId) ?? new Decimal(0)).add(x.amount),
          );
      }
      for (const i of ctx.items)
        expect(
          (allocated.get(i.variantId) ?? new Decimal(0)).lte(i.unitPrice),
        ).toBe(true);
      expect(
        new Decimal(r.discountedSubtotal)
          .add(r.merchandiseDiscount)
          .eq(r.subtotal),
      ).toBe(true);
    }
  });
});

describe("09B multi-buy and evidence-based caps", () => {
  it("buy two get one requires three units and chooses the cheapest existing unit", () => {
    const p = promotion();
    p.definition.effect = { type: "buyXGetY", buy: 2, get: 1 };
    expect(reason(p)).toBe("NO_BENEFIT");
    const ctx = context();
    ctx.items.push({
      ...ctx.items[0],
      variantId: "cheap",
      quantity: 1,
      unitPrice: "5",
    });
    const r = result(p, ctx);
    expect(r.discountTotal).toBe("5.0000");
    expect(r.lines[0].allocations).toEqual([
      { variantId: "cheap", amount: "5.0000" },
    ]);
    expect(ctx.items).toHaveLength(2);
  });
  it("multi-buy does not expand one million quantities, and clips a max benefit", () => {
    const p = promotion();
    p.definition.effect = { type: "buyXGetY", buy: 2, get: 1 };
    p.definition.maxDiscount = "25";
    const ctx = context();
    ctx.items[0].quantity = 1000000;
    expect(result(p, ctx).discountTotal).toBe("25.0000");
  });
  it("spend steps use only original eligible merchandise, with a configured set cap", () => {
    const p = promotion();
    p.definition.effect = {
      type: "spendXGetY",
      spend: "30",
      amount: "5",
      maxSets: 2,
    };
    expect(result(p).discountTotal).toBe("10.0000");
    p.definition.effect.maxSets = null;
    expect(result(p).discountTotal).toBe("15.0000");
  });
  it.each([{ totalUsageCap: 2 }, { perCustomerCap: 2 }, { budget: "50" }])(
    "fails closed without cap evidence %j",
    (limit) => {
      expect(reason(promotion(limit), context({ customer: customer() }))).toBe(
        "USAGE_UNAVAILABLE",
      );
    },
  );
  it("treats a configured zero cap as no availability, not unlimited", () => {
    expect(
      reason(promotion({ totalUsageCap: 0 }), context({ usage: [usage()] })),
    ).toBe("TOTAL_CAP");
    expect(
      reason(
        promotion({ perCustomerCap: 0 }),
        context({ customer: customer(), usage: [usage()] }),
      ),
    ).toBe("CUSTOMER_CAP");
  });
  it("requires identified customer for per-customer cap", () => {
    expect(reason(promotion({ perCustomerCap: 1 }))).toBe("CUSTOMER_REQUIRED");
  });
  it("rejects stale revision or other-customer evidence", () => {
    const p = promotion({ perCustomerCap: 2 });
    for (const u of [
      { ...usage(), revision: 2 },
      { ...usage(), customerId: "other" },
      { ...usage(), customerUsed: null },
    ]) {
      expect(reason(p, context({ customer: customer(), usage: [u] }))).toBe(
        "USAGE_UNAVAILABLE",
      );
    }
  });
  it("enforces both total and per-customer caps without consuming the snapshots", () => {
    const ctx = context({ customer: customer(), usage: [usage()] });
    const p = promotion({ totalUsageCap: 1, perCustomerCap: 1 });
    const before = JSON.stringify(ctx);
    expect(result(p, ctx)).toEqual(result(p, ctx));
    expect(JSON.stringify(ctx)).toBe(before);
    ctx.usage[0].totalUsed = 1;
    expect(reason(p, ctx)).toBe("TOTAL_CAP");
    ctx.usage[0].totalUsed = 0;
    ctx.usage[0].customerUsed = 1;
    expect(reason(p, ctx)).toBe("CUSTOMER_CAP");
  });
  it("accepts an exact budget boundary and rejects an overrun rather than silently lowering reward", () => {
    const ctx = context({ usage: [{ ...usage(), spent: "90" }] });
    const p = promotion({ budget: "100" });
    expect(reason(p, ctx)).toBe("APPLIED");
    ctx.usage[0].spent = "90.0001";
    expect(reason(p, ctx)).toBe("BUDGET_EXCEEDED");
    p.budget = "0";
    expect(reason(p, ctx)).toBe("BUDGET_EXCEEDED");
  });
});
