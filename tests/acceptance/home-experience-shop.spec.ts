import { test, expect, type Page } from "@playwright/test";

async function openShop(
  page: Page,
  locale: string,
  market: string,
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${locale}/m/${market}`);
  const shop = page.locator('[data-moda4="shop-the-look"]');
  await shop.scrollIntoViewIfNeeded();
  await expect(shop.locator(".home-look-tabs button")).toHaveCount(4);
  return shop;
}

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const)
  for (const width of [390, 1440]) {
    test(`${locale}/${width}: real look photography, independent pieces and exact fitting links`, async ({
      page,
    }) => {
      const shop = await openShop(page, locale, market, width);
      const tabs = shop.locator(".home-look-tabs button");
      const ids: string[] = [];
      for (let index = 0; index < 4; index++) {
        await tabs.nth(index).click();
        const look = shop.locator(".home-look-studio:visible");
        ids.push((await look.getAttribute("data-look-id"))!);
        const count = [3, 3, 2, 2][index];
        await expect(look.locator(".editorial-piece")).toHaveCount(count);
        await expect(look.locator(".editorial-piece picture")).toHaveCount(
          count,
        );
        for (const image of await look.locator("img:visible").all()) {
          await image.scrollIntoViewIfNeeded();
          await expect
            .poll(() =>
              image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
            )
            .toBeGreaterThan(0);
        }
        const fitting = new URL(
          (await look.locator(".editorial-total > a").getAttribute("href"))!,
          "http://localhost",
        );
        expect(fitting.pathname).toBe(`/${locale}/fitting-room`);
        expect(fitting.searchParams.get("market")).toBe(market);
        expect(fitting.searchParams.get("look")).toBe(ids[index]);
      }
      expect(new Set(ids).size).toBe(4);
      await tabs.first().click();
      await tabs.first().press(locale === "fa" ? "ArrowLeft" : "ArrowRight");
      await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
    });

    test(`${locale}/${width}: individual, double click and completed repeat keep one of each variant`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const shop = await openShop(page, locale, market, width);
      await shop.locator(".home-look-tabs button").nth(1).click();
      const look = shop.locator(".home-look-studio:visible");
      await expect(look).toHaveAttribute(
        "data-look-id",
        "fixture-editorial-easy-days",
      );
      const pieces = look.locator(".editorial-piece");
      await expect(pieces).toHaveCount(3);
      const ids: string[] = [];
      for (const piece of await pieces.all()) {
        const size = piece.getByRole("combobox", {
          name: { fa: "سایز", tr: "Beden", en: "Size" }[locale],
        });
        await expect(size).toHaveCount(1);
        const option = size
          .locator('option:not([value=""]):not([disabled])')
          .first();
        const id = (await option.getAttribute("value"))!;
        ids.push(id);
        await size.selectOption(id);
      }
      let requests = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.postData()?.includes(ids[0]))
          requests++;
      });
      async function buy(
        button: ReturnType<typeof look.locator>,
        clickCount: number,
      ) {
        const response = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            !!response.request().postData()?.includes(ids[0]),
        );
        await button.click({ clickCount });
        const result = await response;
        expect(result.status()).toBe(200);
        await expect(look.locator('[role="status"]')).toBeVisible();
        await expect(look.locator('[role="alert"]')).toHaveCount(0);
        await expect(button).toBeEnabled();
      }
      await buy(pieces.first().locator("button"), 2);
      const batch = look.locator(".editorial-total > button");
      await buy(batch, 2);
      await buy(batch, 1);
      expect(requests).toBe(3);
      const fitting = new URL(
        (await look.locator(".editorial-total > a").getAttribute("href"))!,
        "http://localhost",
      );
      expect(fitting.searchParams.get("variants")?.split(",")).toEqual(ids);
      await page.goto(`/${locale}/cart?market=${market}`);
      const quantities = page.locator('input[type="number"][name="quantity"]');
      await expect(quantities).toHaveCount(3);
      for (const input of await quantities.all())
        await expect(input).toHaveValue("1");
      await page.goto(`/${locale}/m/${market}/looks`);
      await page.goBack();
      await expect(quantities).toHaveCount(3);
      for (const input of await quantities.all())
        await expect(input).toHaveValue("1");
      expect(errors).toEqual([]);
    });
  }
