import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const labels = {
  fa: {
    menu: "ناوبری موبایل",
    language: "زبان فروشگاه",
    market: "بازار خرید شما",
  },
  tr: {
    menu: "Mobil gezinme",
    language: "Mağaza dili",
    market: "Alışveriş bölgeniz",
  },
  en: {
    menu: "Mobile navigation",
    language: "Shop language",
    market: "Your shopping market",
  },
};
for (const locale of ["fa", "tr", "en"] as const)
  for (const width of [360, 390, 430]) {
    test(`${locale} ${width}px app navigation and search`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.context().clearCookies();
      await page.goto(`/${locale}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "fa" ? "rtl" : "ltr",
      );
      const nav = page.getByTestId("mobile-bottom-navigation");
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link")).toHaveCount(4);
      await expect(nav.locator(`a[href="/${locale}"]`)).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      for (const link of await nav.getByRole("link").all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const menu = page.locator(".storefront-menu-toggle");
      await menu.click();
      const panel = page.locator(".storefront-menu-panel");
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("navigation", { name: labels[locale].language }),
      ).toBeVisible();
      await expect(
        panel.getByRole("combobox", { name: labels[locale].market }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
      await expect(menu).toBeFocused();
      if (width === 390) {
        const file = info.outputPath(`home-${locale}-${width}.png`);
        await page.screenshot({ path: file });
        await info.attach("mobile-home", {
          path: file,
          contentType: "image/png",
        });
        const metrics = await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight },
          navigation: performance
            .getEntriesByType("navigation")
            .map((entry) => entry.toJSON()),
          resources: performance.getEntriesByType("resource").length,
        }));
        await writeFile(
          info.outputPath(`measurements-${locale}.json`),
          JSON.stringify(metrics, null, 2),
        );
      }
      const search = page.locator('header input[name="q"]');
      await search.fill("linen");
      await search.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/${locale}/search\\?q=linen`));
      await expect(nav.locator(`a[href="/${locale}/search"]`)).toHaveAttribute(
        "aria-current",
        "page",
      );
      await nav.locator(`a[href="/${locale}/cart"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/cart$`));
      await nav.locator(`a[href="/${locale}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    });
  }
test("large text and desktop keep navigation/content reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/fa");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByTestId("mobile-bottom-navigation")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en");
  await expect(page.getByTestId("mobile-bottom-navigation")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
