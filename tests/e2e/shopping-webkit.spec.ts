import { test, expect, devices } from "@playwright/test";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
test.use({ ...devices["iPhone 13"], browserName: "webkit" });
for (const locale of ["fa", "tr", "en"] as const) {
  test(`${locale} Safari engine mobile browse, selection, cart and checkout`, async ({
    page,
  }, info) => {
    const t = { fa, tr, en }[locale],
      category = { fa: "زنانه", tr: "kadin", en: "women" }[locale],
      slug = { fa: "محصول-1", tr: "urun-1", en: "product-1" }[locale];
    await page.goto(`/${locale}`);
    await shoppingProof(page, info, `${locale}-webkit-home`);
    await page.goto(`/${locale}/c/${encodeURIComponent(category)}`);
    await page
      .getByRole("button", { name: new RegExp(t.catalog.filters) })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shoppingProof(page, info, `${locale}-webkit-filters`);
    await page
      .getByRole("button", { name: t.shopping.close, exact: true })
      .click();
    await page.goto(`/${locale}/p/${encodeURIComponent(slug)}`);
    const add = page.locator(".shop-add-button");
    await expect(add).toBeVisible();
    await expect(add).toBeEnabled();
    const box = await add.boundingBox(),
      nav = await page.getByTestId("mobile-bottom-navigation").boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
    await shoppingProof(page, info, `${locale}-webkit-product`);
    await page.locator(".shop-gallery-slide").first().click();
    await expect(page.locator(".shop-gallery-zoom")).toBeVisible();
    await page
      .getByRole("button", { name: t.shopping.close, exact: true })
      .click();
    await add.click();
    await expect(
      page.getByRole("status").filter({ hasText: t.commerce.saved }),
    ).toBeVisible();
    await page.goto(`/${locale}/cart`);
    await shoppingProof(page, info, `${locale}-webkit-cart`);
    await page
      .locator("main")
      .getByRole("link", { name: t.commerce.checkout, exact: true })
      .click();
    await expect(page.locator('main [name="firstName"]')).toBeVisible();
    await shoppingProof(page, info, `${locale}-webkit-checkout`);
    await page.setViewportSize({ width: 844, height: 390 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addStyleTag({ content: "html{font-size:200%}" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
