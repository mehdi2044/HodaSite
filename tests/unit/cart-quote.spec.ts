import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  market: vi.fn(),
  variants: vi.fn(),
  rules: vi.fn(),
  price: vi.fn(),
  stock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    market: { findUniqueOrThrow: mock.market },
    variant: { findMany: mock.variants },
    feeRule: { findMany: mock.rules },
  },
}));
vi.mock("@/modules/pricing", () => ({ getDisplayPrice: mock.price }));
vi.mock("@/modules/inventory", () => ({ availableForVariant: mock.stock }));
import { quoteCart } from "@/modules/fees/quote";
const market = {
  id: "CA",
  currency: "CAD",
  isActive: true,
  salesPaused: false,
  volumetricDivisor: "5000",
};
const variant = {
  id: "v",
  product: { categoryId: "c", weightGrams: 1000 },
  weightGrams: null,
  dimensions: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.market.mockResolvedValue(market);
  mock.variants.mockResolvedValue([variant]);
  mock.price.mockResolvedValue({ amount: "10" });
  mock.stock.mockResolvedValue(5);
  mock.rules.mockResolvedValue([]);
});
describe("cart quote eligibility", () => {
  it("enforces publication and market eligibility in the database query", async () => {
    const result = await quoteCart({
      marketId: "CA",
      items: [{ variantId: "v", quantity: 2 }],
    });
    expect(mock.variants).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          product: {
            status: "ACTIVE",
            deletedAt: null,
            marketIds: { has: "CA" },
          },
        }),
      }),
    );
    expect(result.total).toBe("20");
  });
  it("rejects a hidden or other-market variant returned as unavailable", async () => {
    mock.variants.mockResolvedValue([]);
    await expect(
      quoteCart({
        marketId: "CA",
        items: [{ variantId: "hidden", quantity: 1 }],
      }),
    ).rejects.toThrow("unavailable");
    expect(mock.price).not.toHaveBeenCalled();
  });
  it.each([{ isActive: false }, { salesPaused: true }])(
    "rejects a disabled market: %j",
    async (state) => {
      mock.market.mockResolvedValue({ ...market, ...state });
      await expect(
        quoteCart({ marketId: "CA", items: [{ variantId: "v", quantity: 1 }] }),
      ).rejects.toThrow("Market is unavailable");
    },
  );
  it("combines duplicate lines before checking stock", async () => {
    await expect(
      quoteCart({
        marketId: "CA",
        items: [
          { variantId: "v", quantity: 3 },
          { variantId: "v", quantity: 3 },
        ],
      }),
    ).rejects.toThrow("Insufficient stock");
  });
  it("combines duplicate lines into one price line", async () => {
    const result = await quoteCart({
      marketId: "CA",
      items: [
        { variantId: "v", quantity: 1 },
        { variantId: "v", quantity: 2 },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe("30");
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s",
    async (quantity) => {
      await expect(
        quoteCart({ marketId: "CA", items: [{ variantId: "v", quantity }] }),
      ).rejects.toThrow("positive integers");
    },
  );
  it("rejects an empty cart", async () => {
    await expect(quoteCart({ marketId: "CA", items: [] })).rejects.toThrow(
      "empty",
    );
  });
});
