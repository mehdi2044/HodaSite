import { test, expect } from "@playwright/test";
import { shoppingProof } from "./helpers/shopping-proof";

for (const [locale, market, labels] of [
  ["fa", "IR", ["زنان", "مردان", "کودکان", "اکسسوری"]],
  ["tr", "TR", ["Kadın", "Erkek", "Çocuk", "Aksesuar"]],
  ["en", "CA", ["Women", "Men", "Kids", "Accessories"]],
] as const) {
  test(`${locale}: four equal departments, real category routes, history and full images`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.goto(`/${locale}/m/${market}`);
    const departments = page.getByTestId("hero-departments");
    await expect(departments.getByRole("link")).toHaveCount(4);
    for (const width of [360, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await departments
        .getByRole("link")
        .evaluateAll((links) =>
          links.map((link) => ({
            width: link.getBoundingClientRect().width,
            height: link.getBoundingClientRect().height,
          })),
        );
      expect(
        Math.max(...dimensions.map((d) => d.width)) -
          Math.min(...dimensions.map((d) => d.width)),
      ).toBeLessThan(2);
      expect(
        Math.max(...dimensions.map((d) => d.height)) -
          Math.min(...dimensions.map((d) => d.height)),
      ).toBeLessThan(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390 || width === 1280)
        await shoppingProof(page, info, `spatial-home-${locale}-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
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
    await page
      .getByTestId("home-product-strip")
      .locator("article a")
      .first()
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
