import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  cart: vi.fn(),
  market: vi.fn(),
  variants: vi.fn(),
  rules: vi.fn(),
  evaluate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    cart: { findFirst: mock.cart },
    market: { findUniqueOrThrow: mock.market },
    variant: { findMany: mock.variants },
    feeRule: { findMany: mock.rules },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: vi.fn() }),
  },
}));
vi.mock("@/modules/access", () => ({ assertCan: vi.fn() }));
vi.mock("@/modules/promotions/persistence", () => ({
  promotionAdmin: async () => "admin",
}));
vi.mock("@/modules/promotions/evidence", () => ({
  evaluateStoredPromotions: mock.evaluate,
}));
vi.mock("@/modules/pricing", () => ({
  getDisplayPrice: async () => ({ amount: "100" }),
}));
vi.mock("@/modules/inventory", () => ({ availableForVariant: async () => 5 }));
import { simulatePromotionCart } from "@/modules/promotions/simulator";

const variant = {
  id: "variant",
  productId: "product",
  product: { categoryId: "category", collections: [], weightGrams: 100 },
};
const cart = {
  id: "cart",
  marketId: "market",
  locale: "en",
  customerId: null,
  items: [{ variantId: variant.id, quantity: 1, variant }],
  checkout: {},
};
const input = { marketId: "market", cartId: "cart", couponCodes: [] };
beforeEach(() => {
  vi.clearAllMocks();
  mock.cart.mockResolvedValue(cart);
  mock.market.mockResolvedValue({
    id: "market",
    currency: "USD",
    isActive: true,
    salesPaused: false,
    volumetricDivisor: "5000",
  });
  mock.variants.mockResolvedValue([variant]);
  const base = {
    type: "SHIPPING",
    method: "FIXED",
    currency: "USD",
    isActive: true,
    selectable: true,
    priority: 0,
    validFrom: new Date(0),
  };
  mock.rules.mockResolvedValue([
    { ...base, id: "global", priority: 1, params: { amount: "5" } },
    { ...base, id: "province", province: "ON", params: { amount: "15" } },
    {
      ...base,
      id: "local",
      province: "ON",
      city: "Toronto",
      postalPrefix: "M5V",
      params: { amount: "25" },
    },
    { ...base, id: "express", params: { amount: "35" } },
    { ...base, id: "private", selectable: false, params: { amount: "50" } },
  ]);
  mock.evaluate.mockResolvedValue({ result: { discountTotal: "0.0000" } });
});

describe("simulation uses the saved cart's shipping quote", () => {
  it.each([
    [{}, "5.0000"],
    [{ province: "", city: "", postalCode: "", shippingRuleId: "" }, "5.0000"],
    [{ province: " ON ", city: "" }, "15.0000"],
    [{ province: "ON", city: "Toronto", postalCode: "M5V 1A1" }, "25.0000"],
    [{ province: "ON", shippingRuleId: "express" }, "35.0000"],
  ])("quotes saved shipping %j as %s", async (checkout, shippingAmount) => {
    mock.cart.mockResolvedValue({ ...cart, checkout });
    await simulatePromotionCart(input);
    expect(mock.evaluate.mock.calls[0][1].shippingAmount).toBe(shippingAmount);
  });

  it.each([
    { province: 12 },
    { city: ["Toronto"] },
    { postalCode: "x".repeat(21) },
    { shippingRuleId: "x".repeat(101) },
    { shippingRuleId: "missing" },
    { shippingRuleId: "private" },
    { province: "BC", shippingRuleId: "local" },
  ])(
    "rejects invalid saved shipping %j without an estimate",
    async (checkout) => {
      mock.cart.mockResolvedValue({ ...cart, checkout });
      await expect(simulatePromotionCart(input)).rejects.toThrow();
      expect(mock.evaluate).not.toHaveBeenCalled();
    },
  );
});
