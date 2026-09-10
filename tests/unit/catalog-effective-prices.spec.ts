import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  products: vi.fn(),
  market: vi.fn(),
  price: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    product: { findMany: mock.products },
    market: { findUniqueOrThrow: mock.market },
  },
}));
vi.mock("@/modules/pricing", () => ({ getDisplayPrice: mock.price }));
import { listCatalogProducts } from "@/modules/catalog/queries";
const products = [
  {
    id: "expensive-base",
    basePriceAmount: "100",
    compareAtPriceAmount: null,
    variants: [{ id: "v1", priceOverrideUsd: null }],
  },
  {
    id: "cheap-base",
    basePriceAmount: "5",
    compareAtPriceAmount: null,
    variants: [{ id: "v2", priceOverrideUsd: "80" }],
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  mock.market.mockResolvedValue({ id: "CA" });
  mock.products.mockResolvedValueOnce(products).mockResolvedValue(products);
  mock.price.mockImplementation(async (p: { id: string }) => ({
    amount: p.id === "expensive-base" ? "10" : "100",
  }));
});
it("filters on the displayed market override, not the USD base", async () => {
  const result = await listCatalogProducts("CA", "en", { maxPrice: "20" });
  expect(result.items.map((p) => p.id)).toEqual(["expensive-base"]);
  expect(result.total).toBe(1);
});
it("sorts before pagination using effective variant prices", async () => {
  const result = await listCatalogProducts("CA", "en", {
    sort: "price-asc",
    limit: 1,
    page: 2,
  });
  expect(result.items.map((p) => p.id)).toEqual(["cheap-base"]);
  expect(result.total).toBe(2);
  expect(result.pages).toBe(2);
});
it("supports descending prices and lower bounds", async () => {
  const result = await listCatalogProducts("CA", "en", {
    sort: "price-desc",
    minPrice: "10",
  });
  expect(result.items.map((p) => p.id)).toEqual([
    "cheap-base",
    "expensive-base",
  ]);
});
