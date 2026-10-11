import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { styleProducts } from "../../prisma/style-seed";
import { shoppingProof } from "./helpers/shopping-proof";

const db = new PrismaClient();
let originalDates: Array<{ id: string; createdAt: Date; updatedAt: Date }> = [];
test.beforeAll(async () => {
  // Integration suites create incomplete-language products. This visual/navigation
  // proof explicitly uses the 20 fully translated demo fixtures, then restores them.
  const ids = styleProducts.map(([key]) => `seed-style-v2-${key}`);
  originalDates = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, createdAt: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  expect(originalDates).toHaveLength(20);
  const start = Date.now() + 86400000;
  await db.$transaction(
    originalDates.map((p, index) =>
      db.product.update({
        where: { id: p.id },
        data: { createdAt: new Date(start + index) },
      }),
    ),
  );
});
test.afterAll(async () => {
  try {
    await db.$transaction(
      originalDates.map(({ id, createdAt, updatedAt }) =>
        db.product.update({ where: { id }, data: { createdAt, updatedAt } }),
      ),
    );
  } finally {
    await db.$disconnect();
  }
});

for (const [locale, market, labels] of [
  ["fa", "IR", ["زنان", "مردان", "کودکان", "اکسسوری"]],
  ["tr", "TR", ["Kadın", "Erkek", "Çocuk", "Aksesuar"]],
  ["en", "CA", ["Women", "Men", "Kids", "Accessories"]],
] as const) {
  test(`${locale}: each department has five usable products before the optional look studio`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.goto(`/${locale}/m/${market}`);
    const shelves = page.locator(".shop-department-shelf");
    await expect(shelves).toHaveCount(4);
    for (const [index, label] of labels.entries()) {
      const shelf = shelves.nth(index);
      await expect(shelf.getByRole("heading", { level: 2 })).toHaveText(label);
      const cards = shelf.locator(".shop-product-card");
      await expect(cards).toHaveCount(5);
      const browse = shelf.locator(".shop-section-link");
      const href = await browse.getAttribute("href");
      expect(href).toContain(`/${locale}/m/${market}/c/`);
      await browse.click();
      await expect(page).toHaveURL(href!);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
      await page.goBack();
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await shelves.first().scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await shelves
        .first()
        .locator("img")
        .evaluateAll(async (images) => {
          await Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          );
        });
      await shoppingProof(page, info, `department-shelf-${locale}-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const rail = shelves.first().locator(".shop-product-rail");
    await rail.focus();
    await expect(rail).toBeFocused();
    const fifth = shelves.first().locator(".shop-product-card").nth(4);
    await fifth.scrollIntoViewIfNeeded();
    const fifthHref = await fifth.getByRole("link").getAttribute("href");
    await fifth.getByRole("link").click();
    await expect(page).toHaveURL(fifthHref!);
    await expect(page.locator(".shop-product-title")).toBeVisible();
    await page.goBack();
    expect(
      await shelves.last().evaluate((element) => {
        const look = document.querySelector('[data-testid="shop-look-studio"]');
        return Boolean(
          look &&
          element.compareDocumentPosition(look) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
  });
}
