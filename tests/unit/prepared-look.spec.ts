vi.mock("@/modules/pricing", () => ({
  getDisplayPrice: vi.fn(),
  getDisplayPrices: vi.fn(),
  getVariantDisplayPrices: vi.fn(),
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
  media: vi.fn(),
  products: vi.fn(),
}));
vi.mock("@/modules/content/homepage", async (original) => ({
  ...(await original<typeof import("@/modules/content/homepage")>()),
  getHomepage: mocks.home,
}));
vi.mock("@/lib/db", () => ({
  db: {
    variant: { findMany: mocks.variants },
    product: { findMany: mocks.products },
    media: { findMany: mocks.media },
    category: { findMany: mocks.categories },
  },
}));
vi.mock("@/modules/cart", () => ({ addCartItems: mocks.add }));
import { getDisplayPrice, getVariantDisplayPrices } from "@/modules/pricing";
import { addPreparedLook, preparedLooks } from "@/modules/outfits";
import { categoryRootId } from "@/modules/catalog/tree";
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
  it.each(["READY", "PENDING", "DELETED"])(
    "uses the selected color photograph only when available: %s",
    async (status) => {
      const original = {
        id: "ivory-photo",
        url: "/media/ivory.webp",
        status: "READY",
        deletedAt: null,
      };
      const charcoal = {
        id: "charcoal-photo",
        url: "/media/charcoal.webp",
        status: status === "PENDING" ? "PENDING" : "READY",
        deletedAt: status === "DELETED" ? new Date() : null,
      };
      mocks.media.mockResolvedValue([{ id: "look-photo" }]);
      mocks.categories.mockResolvedValue([{ id: "women" }]);
      mocks.products.mockResolvedValue([
        {
          id: "tee",
          titleI18n: { en: "Tee" },
          slugI18n: { en: "tee" },
          media: [{ media: original }],
          variants: [
            {
              id: "charcoal-m",
              colorId: "charcoal",
              color: {
                nameI18n: { en: "Charcoal" },
                hex: "#40413d",
                deletedAt: null,
              },
              size: { value: "M", deletedAt: null },
              stockItems: [{ onHand: 10, reserved: 0 }],
              media: [{ media: charcoal }],
            },
          ],
        },
      ]);
      vi.mocked(getVariantDisplayPrices).mockResolvedValue(
        new Map([
          [
            "charcoal-m",
            { amount: "20" } as Awaited<ReturnType<typeof getDisplayPrice>>,
          ],
        ]),
      );
      const looks = await preparedLooks(
        {
          type: "ShopLook",
          looks: [
            {
              id: "outfit",
              label: { en: "City" },
              categoryId: "women",
              mediaId: "look-photo",
              items: [{ productId: "tee", colorId: "charcoal" }],
            },
          ],
        } as Parameters<typeof preparedLooks>[0],
        { id: "CA", code: "CA" } as Parameters<typeof preparedLooks>[1],
        "en",
      );
      expect(looks[0].items[0].media?.url).toBe(
        status === "READY" ? "/media/charcoal.webp" : "/media/ivory.webp",
      );
      expect(looks[0].items[0].colorName).toBe("Charcoal");
      expect(looks[0].items[0].variants[0].id).toBe("charcoal-m");
      expect(looks[0].items[0].variants[0].amount).toBe("20");
      expect(getVariantDisplayPrices).toHaveBeenCalledTimes(1);
      expect(getDisplayPrice).not.toHaveBeenCalled();
    },
  );
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
  it("resolves nested departments at every depth", () => {
    const rows = [
      { id: "kids", parentId: null },
      { id: "girls", parentId: "kids" },
      { id: "tops", parentId: "girls" },
      { id: "tees", parentId: "tops" },
      { id: "women", parentId: null },
    ];
    for (const id of ["kids", "girls", "tops", "tees"])
      expect(categoryRootId(rows, id)).toBe("kids");
    expect(categoryRootId(rows, "women")).toBe("women");
  });
  it("refuses broken or cyclic ancestry instead of choosing another department", () => {
    const rows = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
      { id: "orphan", parentId: "missing" },
    ];
    expect(categoryRootId(rows, "a")).toBeNull();
    expect(categoryRootId(rows, "orphan")).toBeNull();
    expect(categoryRootId(rows, "absent")).toBeNull();
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
  it("traverses deep child-before-parent and very wide trees within a linear scan budget", async () => {
    const count = 10000;
    let parentReads = 0;
    const rows = Array.from({ length: count }, (_, i) => ({
      id: `deep-${i}`,
      get parentId() {
        parentReads++;
        return i === 0 ? null : `deep-${i - 1}`;
      },
    })).reverse();
    mocks.categories.mockResolvedValue(rows);
    const family = await categoryFamily("deep-0");
    expect(family).toHaveLength(count);
    expect(family[0]).toBe("deep-0");
    expect(family.at(-1)).toBe(`deep-${count - 1}`);
    expect(parentReads).toBeLessThanOrEqual(10 * count);
    mocks.categories.mockResolvedValue([
      { id: "wide", parentId: null },
      ...Array.from({ length: 70000 }, (_, i) => ({
        id: `wide-${i}`,
        parentId: "wide",
      })),
    ]);
    expect(await categoryFamily("wide")).toHaveLength(70001);
  });
});
