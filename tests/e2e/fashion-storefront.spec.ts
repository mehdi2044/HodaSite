import { test, expect } from "@playwright/test";
import { shoppingProof } from "./helpers/shopping-proof";

for (const locale of ["fa", "tr", "en"] as const) {
  test(`${locale}: editorial home and product imagery stay usable across widths`, async ({
    page,
  }, info) => {
    await page.goto(`/${locale}`);
    const hero = page.getByTestId("storefront-hero");
    await expect(hero.locator("img")).toBeVisible();
    await expect
      .poll(() =>
        hero
          .locator("img")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(hero.getByRole("link")).toHaveAttribute(
      "href",
      `/${locale}/search`,
    );
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
    await expect
      .poll(() =>
        card
          .locator("img")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await card.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/p/`));
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
