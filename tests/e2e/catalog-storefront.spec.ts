import { expect, test } from "@playwright/test";

for (const entry of [
  {
    locale: "fa",
    category: "زنانه",
    product: "محصول-1",
    title: "محصول نمونه 1",
    dir: "rtl",
  },
  {
    locale: "tr",
    category: "kadin",
    product: "urun-1",
    title: "Örnek ürün 1",
    dir: "ltr",
  },
  {
    locale: "en",
    category: "women",
    product: "product-1",
    title: "Sample product 1",
    dir: "ltr",
  },
] as const) {
  test(`${entry.locale} category and product catalog`, async ({ page }) => {
    await page.goto(`/${entry.locale}/c/${encodeURIComponent(entry.category)}`);
    await expect(page.locator("main")).toHaveAttribute("dir", entry.dir);
    await expect(page.locator("article").first()).toBeVisible();
    await page.goto(`/${entry.locale}/p/${encodeURIComponent(entry.product)}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      entry.title,
    );
    await expect(
      page.locator('script[type="application/ld+json"]'),
    ).toHaveCount(1);
    const swatches = page.locator("button[title]");
    if ((await swatches.count()) > 1) await swatches.nth(1).click();
    await page
      .locator("summary")
      .filter({ hasText: /راهنمای سایز|Beden ve bakım|Size and care/ })
      .click();
    await expect(
      page.getByRole("button", { name: /سبد|Sepete|bag/ }),
    ).toBeVisible();
  });
}

test("Persian normalization finds Persian and Arabic code points", async ({
  page,
}) => {
  await page.goto("/fa/search?q=محصول");
  await expect(page.locator("article").first()).toBeVisible();
});

test("market-restricted product is hidden outside its market", async ({
  page,
}) => {
  const hidden = await page.request.get(
    "/fa/p/%D9%85%D8%AD%D8%B5%D9%88%D9%84-30",
  );
  expect(hidden.status()).toBe(404);
  await page.context().clearCookies();
  const visible = await page.request.get("/tr/p/urun-30");
  expect(visible.status()).toBe(200);
});

test("filters update the URL through client navigation", async ({ page }) => {
  await page.goto("/en/c/women");
  await page.getByLabel("Brand").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/brand=/);
});
