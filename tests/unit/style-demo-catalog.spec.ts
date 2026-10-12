import { describe, expect, it } from "vitest";
import { styleProducts } from "../../prisma/style-seed";
import { isCompleteStyleCatalog } from "../../scripts/style-demo-catalog";

function fixture() {
  const categories = ["women", "men", "kids", "accessories"].flatMap(
    (department) => [
      {
        id: `seed-category-${department}`,
        parentId: null,
        deletedAt: null as Date | null,
      },
      {
        id: `${department}-child`,
        parentId: `seed-category-${department}`,
        deletedAt: null as Date | null,
      },
    ],
  );
  const products = styleProducts.map(([key]) => ({
    id: `seed-style-v2-${key}`,
    categoryId: `${key.split("-")[0]}-child`,
    marketIds: ["ir", "tr", "ca"],
    status: "ACTIVE",
    deletedAt: null as Date | null,
  }));
  return { categories, products, markets: ["ir", "tr", "ca"] };
}
describe("existing demo catalog rewrite precondition", () => {
  it("accepts all live families in every active market", () => {
    const { products, categories, markets } = fixture();
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(true);
  });
  it("declines when a merchant moves a product to a different department", () => {
    const { products, categories, markets } = fixture();
    products[0].categoryId = "men-child";
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(false);
  });
  it("declines when a product is unavailable in one active market", () => {
    const { products, categories, markets } = fixture();
    products[0].marketIds = ["ir", "ca"];
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(false);
  });
  it("declines nested department roots even when each product reaches its expected category", () => {
    const { products, categories, markets } = fixture();
    categories[0].parentId = "seed-category-men";
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(false);
  });
  it("declines deleted family ancestors and bounds malformed cycles", () => {
    const { products, categories, markets } = fixture();
    categories[0].deletedAt = new Date();
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(false);
    categories[0].deletedAt = null;
    categories[1].parentId = "women-child";
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(false);
  });
  it("declines missing, deleted or inactive merchandise and no active markets", () => {
    const { products, categories, markets } = fixture();
    expect(isCompleteStyleCatalog(products.slice(1), categories, markets)).toBe(
      false,
    );
    products[0].deletedAt = new Date();
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(false);
    products[0].deletedAt = null;
    products[0].status = "DRAFT";
    expect(isCompleteStyleCatalog(products, categories, markets)).toBe(false);
    expect(isCompleteStyleCatalog(fixture().products, categories, [])).toBe(
      false,
    );
  });
});
