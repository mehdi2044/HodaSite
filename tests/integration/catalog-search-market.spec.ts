import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findProductBySlug, listCatalogProducts } from "@/modules/catalog";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let marketId = "",
  categoryId = "",
  colorId = "",
  sizeId = "",
  productId = "";
describe.skipIf(!hasDb)("catalog search and market visibility", () => {
  beforeAll(async () => {
    const market = await db.market.create({
      data: {
        code: `C${suffix}`,
        name: "Catalog test",
        currency: "USD",
        defaultLocale: "en",
        enabledLocales: ["en"],
        roundingRule: {},
        holdHours: 1,
        paymentDeadlineHours: 1,
        fxMode: "AUTO_ACCEPT",
      },
    });
    marketId = market.id;
    const category = await db.category.create({
      data: {
        slugI18n: {
          fa: `دسته-${suffix}`,
          tr: `kategori-${suffix}`,
          en: `category-${suffix}`,
        },
        titleI18n: { fa: "دسته", tr: "Kategori", en: "Category" },
        gender: "UNISEX",
      },
    });
    categoryId = category.id;
    const color = await db.color.create({
      data: {
        code: `T-${suffix}`.toUpperCase(),
        hex: "#112233",
        nameI18n: { fa: "مشکی", tr: "Siyah", en: "Black" },
      },
    });
    colorId = color.id;
    const size = await db.size.create({
      data: { scale: "INTL", value: `M-${suffix}`, groupKey: "test" },
    });
    sizeId = size.id;
    const product = await db.product.create({
      data: {
        slugI18n: {
          fa: `پیراهن-${suffix}`,
          tr: `gomlek-${suffix}`,
          en: `shirt-${suffix}`,
        },
        titleI18n: { fa: "پیراهن کتان", tr: "Keten gömlek", en: "Linen shirt" },
        descriptionI18n: { fa: "توضیح", tr: "Açıklama", en: "Description" },
        categoryId,
        gender: "UNISEX",
        status: "ACTIVE",
        basePriceAmount: "10",
        marketIds: [marketId],
        searchText: "پیراهن کتان linen shirt keten gomlek",
        variants: {
          create: { sku: `TEST-${suffix}`.toUpperCase(), colorId, sizeId },
        },
      },
    });
    productId = product.id;
  });
  afterAll(async () => {
    if (productId) await db.product.delete({ where: { id: productId } });
    if (sizeId) await db.size.delete({ where: { id: sizeId } });
    if (colorId) await db.color.delete({ where: { id: colorId } });
    if (categoryId) await db.category.delete({ where: { id: categoryId } });
    if (marketId) await db.market.delete({ where: { id: marketId } });
  });
  it("finds normalized Persian through the maintained search vector", async () => {
    const result = await listCatalogProducts(marketId, "fa", { q: "پيراهن" });
    expect(result.items.map((x) => x.id)).toContain(productId);
  });
  it("does not expose a product to a different market", async () => {
    const result = await listCatalogProducts("not-this-market", "en", {
      q: "linen shirt",
    });
    expect(result.items).toHaveLength(0);
  });
  it("loads a draft only through the explicit preview lookup", async () => {
    await db.product.update({
      where: { id: productId },
      data: { status: "DRAFT" },
    });
    const slug = `shirt-${suffix}`;
    expect(await findProductBySlug(marketId, "en", slug)).toBeNull();
    expect(
      await findProductBySlug(marketId, "en", slug, {
        includeInactive: true,
      }),
    ).toMatchObject({ id: productId, status: "DRAFT" });
    await db.product.update({
      where: { id: productId },
      data: { status: "ACTIVE" },
    });
  });
});
