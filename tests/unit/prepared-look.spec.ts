vi.mock("@/modules/pricing", () => ({
  getDisplayPrice: vi.fn(),
  getDisplayPrices: vi.fn(),
}));
vi.mock("@/modules/orders", () => ({
  CommerceError: class CommerceError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));
vi.mock("@/modules/auth", () => ({ auth: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  home: vi.fn(),
  variants: vi.fn(),
  add: vi.fn(),
  categories: vi.fn(),
}));
vi.mock("@/modules/content/homepage", async (original) => ({
  ...(await original<typeof import("@/modules/content/homepage")>()),
  getHomepage: mocks.home,
}));
vi.mock("@/lib/db", () => ({
  db: {
    variant: { findMany: mocks.variants },
    category: { findMany: mocks.categories },
  },
}));
vi.mock("@/modules/cart", () => ({ addCartItems: mocks.add }));
import { addPreparedLook } from "@/modules/outfits";
import { categoryFamily } from "@/modules/catalog/queries";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import { styleLookBlock, styleProducts } from "../../prisma/style-seed";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.home.mockResolvedValue({
    blocks: [
      {
        type: "ShopLook",
        looks: [
          {
            id: "look",
            items: [
              { productId: "p1", colorId: "c1" },
              { productId: "p2", colorId: "c2" },
            ],
          },
        ],
      },
    ],
  });
  mocks.variants.mockResolvedValue([
    { id: "v1", productId: "p1", colorId: "c1" },
    { id: "v2", productId: "p2", colorId: "c2" },
  ]);
});
describe("prepared look server contract", () => {
  it("accepts selected pieces once and uses live market eligibility", async () => {
    await addPreparedLook("en", "CA", "look", ["v1", "v2"]);
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith("en", ["v1", "v2"]);
    expect(mocks.variants.mock.calls[0][0].where.product.marketIds).toEqual({
      has: "CA",
    });
    expect(mocks.variants.mock.calls[0][0].where.isActive).toBe(true);
  });
  it.each([
    [
      { id: "v1", productId: "p1", colorId: "wrong" },
      { id: "v2", productId: "p2", colorId: "c2" },
    ],
    [{ id: "v1", productId: "p1", colorId: "c1" }],
    [
      { id: "v1", productId: "p1", colorId: "c1" },
      { id: "v2", productId: "p1", colorId: "c1" },
    ],
  ])(
    "rejects a tampered color, unavailable ID or duplicate product: %j",
    async (...rows) => {
      mocks.variants.mockResolvedValue(rows);
      await expect(
        addPreparedLook("en", "CA", "look", ["v1", "v2"]),
      ).rejects.toThrow();
      expect(mocks.add).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown looks and duplicate variant IDs", async () => {
    await expect(
      addPreparedLook("fa", "IR", "missing", ["v1"]),
    ).rejects.toThrow();
    await expect(
      addPreparedLook("fa", "IR", "look", ["v1", "v1"]),
    ).rejects.toThrow();
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("includes all reachable descendants, bounds cycles and excludes other roots", async () => {
    mocks.categories.mockResolvedValue([
      { id: "root", parentId: "grandchild" },
      { id: "child", parentId: "root" },
      { id: "grandchild", parentId: "child" },
      { id: "other", parentId: null },
    ]);
    expect(await categoryFamily("root")).toEqual([
      "root",
      "child",
      "grandchild",
    ]);
    expect(await categoryFamily("missing")).toEqual([]);
  });
  it("provides five distinct demo products per department and valid CMS references", () => {
    for (const department of ["women", "men", "kids", "accessories"])
      expect(
        styleProducts.filter((row) => row[0].startsWith(`${department}-`)),
      ).toHaveLength(5);
    expect(homepageBlocksSchema.safeParse([styleLookBlock]).success).toBe(true);
    expect(
      homepageBlocksSchema.safeParse([styleLookBlock, styleLookBlock]).success,
    ).toBe(false);
  });
});
