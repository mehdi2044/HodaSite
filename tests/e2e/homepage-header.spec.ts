import { test, expect } from "@playwright/test";

// Read-only: use the shared demo homepage without changing merchant data.
for (const [locale, market, cartLabel] of [
  ["fa", "IR", "سبد خرید"],
  ["tr", "TR", "Sepet"],
  ["en", "CA", "Cart"],
] as const) {
  test(`${locale}: shared hero and compact header at narrow widths`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.goto(`/${locale}/m/${market}`);
    await page.evaluate(() => document.fonts.ready);
    const hero = page.getByTestId("storefront-hero");
    const image = hero.locator("img");
    const brand = page.locator(".storefront-brand");
    const brandName = brand.locator(".storefront-brand-name");
    const cart = page.locator("header .storefront-cart-toggle");

    for (const width of [300, 320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "fa" ? "rtl" : "ltr",
      );
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      await expect(hero.getByRole("link")).toHaveAttribute(
        "href",
        `/${locale}/search`,
      );
      await expect(cart).toHaveAccessibleName(`${cartLabel} (0)`);
      await expect(cart.locator(".storefront-cart-mobile")).toBeVisible();
      await expect(cart.locator(".storefront-cart-desktop")).toBeHidden();
      await expect(brand).toBeVisible();
      // admin-media.spec configures an image logo before this spec in CI.
      // Both branding modes are valid; do not mutate shared settings just to
      // force the text-only configuration used by the local preview.
      if (await brandName.count()) {
        await expect(brandName).toBeVisible();
        await expect(brandName).not.toBeEmpty();
        expect(
          await brandName.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return {
              lines: range.getClientRects().length,
              clipped: element.scrollWidth > element.clientWidth,
            };
          }),
        ).toEqual({ lines: 1, clipped: false });
      } else {
        const logo = brand.locator("img");
        await expect(logo).toBeVisible();
        await expect(logo).toHaveAttribute("alt", /\S/);
        await expect
          .poll(() =>
            logo.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
          )
          .toBe(true);
        expect(
          await brand.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const imageBounds = element
              .querySelector("img")!
              .getBoundingClientRect();
            return (
              imageBounds.left >= bounds.left &&
              imageBounds.right <= bounds.right
            );
          }),
        ).toBe(true);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await cart.focus();
      await page.keyboard.press("Enter");
      await expect(cart.locator("..")).toHaveAttribute("open", "");
      await page.keyboard.press("Enter");
      await expect(cart.locator("..")).not.toHaveAttribute("open", "");
      if (width === 300 || width === 390)
        await page.screenshot({
          path: info.outputPath(`header-${locale}-${width}.png`),
        });
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(cart.locator(".storefront-cart-desktop")).toBeVisible();
    await expect(cart.locator(".storefront-cart-mobile")).toBeHidden();
    await expect(page.locator(".storefront-header-grid > nav")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
