import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { shoppingProof } from "./helpers/shopping-proof";

const db = new PrismaClient();
let originalDates: Array<{ id: string; createdAt: Date; updatedAt: Date }> = [];
test.beforeAll(async () => {
  // Other database suites leave newer, imageless TR products. Give the four
  // known illustrated fixtures deterministic placement without changing the
  // real catalog query or hiding valid products from the storefront.
  originalDates = await db.product.findMany({
    where: { id: { in: [26, 27, 28, 29].map((n) => `seed-product-${n}`) } },
    select: { id: true, createdAt: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  expect(originalDates).toHaveLength(4);
  const start = Date.now() + 86400000;
  await db.$transaction(
    originalDates.map((product, index) =>
      db.product.update({
        where: { id: product.id },
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

for (const locale of ["fa", "tr", "en"] as const) {
  test(`${locale}: editorial home and product imagery stay usable across widths`, async ({
    page,
  }, info) => {
    await page.goto(`/${locale}`);
    const hero = page.getByTestId("storefront-hero");
    await expect(hero.locator("img").first()).toBeVisible();
    await expect
      .poll(() =>
        hero
          .locator("img")
          .first()
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(
      hero.locator(".spatial-cta, .shop-hero-content .button"),
    ).toHaveAttribute("href", `/${locale}/search`);
    const categories = page.getByTestId("home-categories");
    await expect(categories.locator("img")).toHaveCount(4);
    for (const width of [360, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390 || width === 1280) {
        await shoppingProof(page, info, `fashion-home-${locale}-${width}`);
        const file = info.outputPath(
          `shopping-fashion-home-full-${locale}-${width}.png`,
        );
        await page.screenshot({ path: file, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page
      .getByTestId("home-product-strip")
      .locator("article")
      .first();
    await card.scrollIntoViewIfNeeded();
    // Verify the real mobile viewport, independently of full-page capture.
    const sizing = await card.evaluate((element) => {
      const rail = element.parentElement!;
      const cardWidth = element.getBoundingClientRect().width;
      const railWidth = rail.getBoundingClientRect().width;
      return {
        ratio: cardWidth / railWidth,
        cardWidth,
        railWidth,
        viewport: innerWidth,
        display: getComputedStyle(rail).display,
      };
    });
    expect(sizing.ratio, JSON.stringify(sizing)).toBeGreaterThan(0.4);
    await expect
      .poll(() =>
        card
          .locator("img")
          .first()
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await shoppingProof(page, info, `fashion-rail-${locale}`);
    await card.getByRole("link").click();
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/m/${{ fa: "IR", tr: "TR", en: "CA" }[locale]}/p/`),
    );
    const image = page.locator(".shop-gallery-slide").first();
    await image.click();
    await expect(page.locator(".shop-gallery-zoom")).toBeVisible();
    await page.locator(".shop-zoom-close").click();
    await expect(page.locator(".shop-gallery-zoom")).not.toBeVisible();
    await expect(page.locator(".shop-demo-note")).toBeVisible();
    await expect(page.locator(".shop-add-button")).toBeEnabled();
    await page.evaluate(() => scrollTo(0, 0));
    await shoppingProof(page, info, `fashion-product-${locale}`);
    await page.locator(".storefront-purchase").scrollIntoViewIfNeeded();
    await shoppingProof(page, info, `fashion-options-${locale}`);
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
