import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { promotionInput } from "../helpers/promotion-program";
import type { PromotionRevision } from "@/modules/promotions";
vi.mock("@/modules/crm/promotion-server", () => ({
  promotionCustomerEvidence: async () => ({
    id: "customer",
    marketId: "market",
    orderCount: 0,
    segmentIds: [],
    tags: [],
    consents: {
      email: "UNKNOWN",
      sms: "UNKNOWN",
      whatsapp: "UNKNOWN",
      telegram: "UNKNOWN",
      push: "UNKNOWN",
    },
  }),
}));
import { evaluateStoredPromotions } from "@/modules/promotions/evidence";
const programs = vi.fn(),
  coupons = vi.fn(),
  groupBy = vi.fn(),
  query = vi.fn();
const tx = {
  promotionProgram: { findMany: programs },
  promotionCoupon: { findMany: coupons },
  promotionRedemption: { groupBy },
  $queryRaw: query,
} as unknown as Prisma.TransactionClient;
const cart = {
  marketId: "market",
  currency: "USD" as const,
  locale: "en" as const,
  items: [
    {
      variantId: "variant",
      productId: "product",
      categoryId: "category",
      collectionIds: [],
      quantity: 1,
      unitPrice: "1000",
    },
  ],
  shippingAmount: "0",
};
function program(id = "p", changes: Partial<PromotionRevision> = {}) {
  return {
    id,
    version: 2,
    marketId: "market",
    currency: "USD",
    revisions: [
      {
        config: {
          ...promotionInput("market", "product", changes).config,
          id,
          revision: 2,
          marketId: "market",
          currency: "USD",
        },
      },
    ],
  };
}
function coupon(id: string, programId = "p") {
  return {
    id,
    programId,
    code: `CODE-${id}`,
    status: "ACTIVE",
    startsAt: new Date(0),
    endsAt: null,
    totalUsageCap: 2,
    perCustomerCap: 2,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  programs.mockResolvedValue([]);
  coupons.mockResolvedValue([]);
  groupBy.mockResolvedValue([]);
  query.mockResolvedValue([{ now: new Date("2026-01-01T00:00:00Z") }]);
});
describe("bounded live promotion usage loading", () => {
  it("uses four aggregate calls for 100 limited programs and 100 limited coupons after locking", async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      program(`p${i}`, { totalUsageCap: 2, perCustomerCap: 2, budget: "20" }),
    );
    const codes = rows.map((p, i) => coupon(`c${i}`, p.id));
    programs.mockResolvedValue(rows);
    coupons.mockResolvedValue(codes);
    const { result } = await evaluateStoredPromotions(
      tx,
      cart,
      "customer",
      codes.map((c) => c.code),
      true,
    );
    expect(result.discountTotal).toBe("1000.0000");
    expect(groupBy).toHaveBeenCalledTimes(4);
    expect(query.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      groupBy.mock.invocationCallOrder[0],
    );
    for (const [args] of groupBy.mock.calls) {
      expect(args.where.evaluation.release).toBeNull();
      expect(args.where).not.toHaveProperty("revision");
      expect(args.where[args.by[0]].in).toHaveLength(100);
    }
  });
  it("does not query usage for disabled, archived, expired or unlimited rules", async () => {
    programs.mockResolvedValue([
      program("disabled", { enabled: false, totalUsageCap: 0 }),
      program("archived", { status: "ARCHIVED", totalUsageCap: 0 }),
      program("expired", { endsAt: "2021-01-01T00:00:00Z", totalUsageCap: 0 }),
      program("unlimited", { couponRequired: false }),
    ]);
    const { result } = await evaluateStoredPromotions(
      tx,
      cart,
      "customer",
      [],
      false,
    );
    expect(result.discountTotal).toBe("10.0000");
    expect(groupBy).not.toHaveBeenCalled();
  });
  it.each([
    [2, 0, "0", "TOTAL_CAP"],
    [0, 2, "0", "CUSTOMER_CAP"],
    [1, 1, "15", "BUDGET_EXCEEDED"],
  ])(
    "preserves lifetime usage rejection %s/%s/%s",
    async (total, used, spent, reason) => {
      programs.mockResolvedValue([
        program("p", {
          couponRequired: false,
          totalUsageCap: 2,
          perCustomerCap: 2,
          budget: "20",
        }),
      ]);
      groupBy.mockResolvedValueOnce([
        {
          programId: "p",
          _count: { _all: total },
          _sum: { amount: new Prisma.Decimal(spent) },
        },
      ]);
      groupBy.mockResolvedValueOnce([
        { programId: "p", _count: { _all: used } },
      ]);
      const { result } = await evaluateStoredPromotions(
        tx,
        cart,
        "customer",
        [],
        false,
      );
      expect(result.discountTotal).toBe("0.0000");
      expect(result.explanations[0].reason).toBe(reason);
      expect(groupBy.mock.calls[1][0].where.evaluation.order.customerId).toBe(
        "customer",
      );
    },
  );
  it("keeps zero capacity and saved inactive previews fail closed", async () => {
    programs.mockResolvedValue([
      program("p", {
        couponRequired: false,
        status: "DRAFT",
        enabled: false,
        totalUsageCap: 0,
      }),
    ]);
    const { result } = await evaluateStoredPromotions(
      tx,
      cart,
      null,
      [],
      false,
      "p",
    );
    expect(result.explanations[0].reason).toBe("TOTAL_CAP");
    expect(groupBy).toHaveBeenCalledTimes(1);
  });
  it("loads only customer counts for a customer-only program limit", async () => {
    programs.mockResolvedValue([
      program("p", { couponRequired: false, perCustomerCap: 2 }),
    ]);
    groupBy.mockResolvedValueOnce([{ programId: "p", _count: { _all: 1 } }]);
    const { result } = await evaluateStoredPromotions(
      tx,
      cart,
      "customer",
      [],
      false,
    );
    expect(result.discountTotal).toBe("10.0000");
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy.mock.calls[0][0].where.evaluation.order.customerId).toBe(
      "customer",
    );
  });
  it("does not load usage for unlimited programs with unlimited coupons", async () => {
    programs.mockResolvedValue([program()]);
    coupons.mockResolvedValue([
      { ...coupon("unlimited"), totalUsageCap: null, perCustomerCap: null },
    ]);
    const { result } = await evaluateStoredPromotions(
      tx,
      cart,
      null,
      ["CODE-unlimited"],
      false,
    );
    expect(result.discountTotal).toBe("10.0000");
    expect(groupBy).not.toHaveBeenCalled();
  });
  it("tries the next eligible coupon when the first has exhausted its customer cap", async () => {
    programs.mockResolvedValue([program()]);
    coupons.mockResolvedValue([coupon("first"), coupon("second")]);
    groupBy.mockResolvedValueOnce([]);
    groupBy.mockResolvedValueOnce([{ couponId: "first", _count: { _all: 2 } }]);
    const { result, couponByProgram } = await evaluateStoredPromotions(
      tx,
      cart,
      "customer",
      ["CODE-first", "CODE-second"],
      false,
    );
    expect(result.discountTotal).toBe("10.0000");
    expect(couponByProgram.get("p")).toBe("second");
    expect(groupBy).toHaveBeenCalledTimes(2);
  });
});
