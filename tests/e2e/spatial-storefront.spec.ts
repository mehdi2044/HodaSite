import { test, expect } from "@playwright/test";
import { shoppingProof } from "./helpers/shopping-proof";

for (const [locale, market, labels] of [
  ["fa", "IR", ["زنان", "مردان", "کودکان", "اکسسوری"]],
  ["tr", "TR", ["Kadın", "Erkek", "Çocuk", "Aksesuar"]],
  ["en", "CA", ["Women", "Men", "Kids", "Accessories"]],
] as const) {
  test(`${locale}: editorial collections stay usable with depth and reduced motion`, async ({
    page,
    browser,
  }, info) => {
    await page.goto(`/${locale}/m/${market}`);
    const categories = page.getByTestId("home-categories");
    const cards = categories.locator(".shop-category-card");
    await expect(cards).toHaveCount(4);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await categories.scrollIntoViewIfNeeded();
      await categories.locator("img").evaluateAll(async (images) => {
        await Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        );
      });
      await shoppingProof(
        page,
        info,
        `editorial-categories-${locale}-${width}`,
      );
    }
    // Resizing Pixel 7 does not change its coarse pointer: touch stays static.
    await cards.first().hover();
    await expect(cards.first().locator(".shop-category-plane")).toHaveCSS(
      "transform",
      "none",
    );
    const desktop = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: { width: 1280, height: 900 },
      isMobile: false,
      hasTouch: false,
    });
    try {
      const desktopPage = await desktop.newPage();
      await desktopPage.goto(`/${locale}/m/${market}`);
      const desktopCard = desktopPage
        .getByTestId("home-categories")
        .locator(".shop-category-card")
        .first();
      await desktopCard.hover();
      await expect(desktopCard.locator(".shop-category-plane")).not.toHaveCSS(
        "transform",
        "none",
      );
      await desktopPage.emulateMedia({ reducedMotion: "reduce" });
      await expect(desktopCard.locator(".shop-category-plane")).toHaveCSS(
        "transform",
        "none",
      );
    } finally {
      await desktop.close();
    }
    await cards.first().focus();
    await expect(cards.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      labels[0],
    );
    await page.goBack();
    await page.setViewportSize({ width: 390, height: 844 });
    const products = page.getByTestId("home-product-strip").first();
    await products.scrollIntoViewIfNeeded();
    const product = products.locator(".shop-product-card").first();
    await expect(product).toBeVisible();
    // Overlay remains its own 44px button; it must not trigger the product link.
    const heart = product.locator(".shop-card-wishlist button");
    await expect(heart).toBeEnabled();
    const before = await heart.getAttribute("aria-pressed");
    await heart.click();
    await expect(heart).toHaveAttribute(
      "aria-pressed",
      before === "true" ? "false" : "true",
    );
    await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}$`));
    await heart.click();
    await products.locator("img").evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) => (image as HTMLImageElement).decode()),
      );
    });
    await shoppingProof(page, info, `editorial-products-${locale}`);
    const href = await product.getByRole("link").getAttribute("href");
    await product.getByRole("link").click();
    await expect(page).toHaveURL(href!);
  });

  test(`${locale}: four editorial planes, real category routes, history and full images`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.goto(`/${locale}/m/${market}`);
    const departments = page.getByTestId("hero-departments");
    await expect(departments.getByRole("link")).toHaveCount(4);
    for (const width of [360, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      // Every editorial plane remains a usable target, despite unequal geometry.
      const dimensions = await departments
        .getByRole("link")
        .evaluateAll((links) =>
          links.map((link) => {
            const rect = link.getBoundingClientRect();
            return {
              width: rect.width,
              height: rect.height,
            };
          }),
        );
      for (const box of dimensions) {
        expect(box.width).toBeGreaterThan(44);
        expect(box.height).toBeGreaterThan(44);
      }
      // Wait for the actual campaign images, not just their blur placeholders.
      await departments.locator("img").evaluateAll(async (images) => {
        await Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        );
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390 || width === 1280)
        await shoppingProof(page, info, `spatial-home-${locale}-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".storefront-app")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    for (const label of labels) {
      const link = departments.getByRole("link", { name: label, exact: true });
      const href = await link.getAttribute("href");
      expect(href).toContain(`/${locale}/m/${market}/c/`);
      await link.click();
      await expect(page).toHaveURL(href!);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        label,
      );
      await page.goBack();
      await expect(departments).toBeVisible();
    }
    const nav = page.getByTestId("mobile-bottom-navigation");
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute(
      "href",
      `/${locale}`,
    );
    // Integration suites also create legitimate imageless products. Exercise
    // the gallery through a real illustrated category card, without changing
    // catalog ordering or mutating the shared database just for this test.
    await departments
      .getByRole("link", { name: labels[3], exact: true })
      .click();
    await page
      .locator(".shop-product-card")
      .filter({ has: page.locator("img") })
      .first()
      .getByRole("link")
      .click();
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute(
      "href",
      `/${locale}/search`,
    );
    await page.locator(".shop-full-image").click();
    await expect(page.locator(".shop-gallery-zoom")).toBeVisible();
    await expect(page.locator(".shop-gallery-zoom img")).toHaveCSS(
      "object-fit",
      "contain",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator(".shop-gallery-zoom")).not.toBeVisible();
    await shoppingProof(page, info, `spatial-product-${locale}`);
    await page.locator(".shop-back-link").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}/c/`));
    await page.goBack();
    await expect(page.locator(".shop-full-image")).toBeVisible();
    await page.locator(".storefront-brand").click();
    await expect(departments).toBeVisible();
  });
}
