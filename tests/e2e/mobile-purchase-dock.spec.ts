import { expect, test, type Locator } from "@playwright/test";

const markets = [
  { locale: "fa", market: "IR", slug: "محصول-1", direction: "rtl" },
  { locale: "en", market: "CA", slug: "product-1", direction: "ltr" },
  { locale: "tr", market: "TR", slug: "urun-1", direction: "ltr" },
] as const;

async function expectHit(control: Locator, scroll: boolean) {
  if (scroll)
    await control.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const { left, width, top, height } = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(left + width / 2, top + height / 2),
        );
      }),
    )
    .toBe(true);
  await control.click({ trial: true });
}

for (const { locale, market, slug, direction } of markets) {
  for (const width of [320, 375, 390, 430, 768]) {
    test(`${locale} ${width}px dock leaves product, cart and Checkout controls reachable`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${locale}/m/${market}/p/${encodeURIComponent(slug)}`);
      const dock = page.getByTestId("mobile-bottom-navigation");
      const buy = page.locator(".shop-product-submit .shop-add-button");
      await expect(page.locator(".storefront-app")).toHaveAttribute(
        "dir",
        direction,
      );
      await expect(dock.getByRole("link")).toHaveCount(6);
      await expect(buy).toBeEnabled();
      const productOptions = page
        .locator('[data-moda4="pdp-sizes"] button:not(:disabled)')
        .first();
      await expectHit(productOptions, true);
      await expectHit(buy, false);
      const dockBox = await dock.boundingBox();
      const buyBox = await buy.boundingBox();
      expect(dockBox).not.toBeNull();
      expect(buyBox).not.toBeNull();
      expect(buyBox!.y + buyBox!.height).toBeLessThanOrEqual(dockBox!.y);
      expect(dockBox!.x + dockBox!.width).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: info.outputPath("product-before-add.png"),
      });
      await buy.click();
      await expect(page.locator(".storefront-cart-toggle bdi")).toHaveText("1");

      await page.goto(`/${locale}/cart?market=${market}`);
      await expect(
        page.locator('main input[name="quantity"][type="number"]'),
      ).toHaveValue("1");
      const checkout = page.locator('main a[href*="/checkout"]').first();
      await expectHit(checkout, true);
      await checkout.click();
      await expect(page).toHaveURL(/\/checkout(?:\?|$)/);
      const address = page
        .locator("form")
        .filter({ has: page.locator('[name="firstName"]') });
      await expectHit(address.locator('[name="firstName"]'), true);
      await expectHit(address.getByRole("button").last(), true);
      await expect(dock).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
  }
}

test("the safe area lifts the purchase bar and dock together", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "The safe-area override uses CDP");
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { bottom: 34, bottomMax: 34 },
  });
  await page.goto("/en/m/CA/p/product-1");
  const dock = page.getByTestId("mobile-bottom-navigation");
  const buy = page.locator(".shop-product-submit .shop-add-button");
  await expectHit(buy, false);
  const dockBox = await dock.boundingBox();
  const buyBox = await buy.boundingBox();
  expect(Math.round(844 - dockBox!.y - dockBox!.height)).toBe(42);
  expect(buyBox!.y + buyBox!.height).toBeLessThanOrEqual(dockBox!.y);
});
