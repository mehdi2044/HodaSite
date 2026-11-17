import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });
for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  for (const width of [320, 390, 430, 768]) {
    test(`mobile labels ${locale} ${width}: whole words, readable targets and unchanged dock height`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${locale}/m/${market}`);
      await page.evaluate(() => document.fonts.ready);
      const dock = page.getByTestId("mobile-bottom-navigation");
      await expect(dock.getByRole("link")).toHaveCount(4);
      const metrics = await dock.evaluate((el) => {
        const nav = el.getBoundingClientRect();
        return {
          height: nav.height,
          overflow: document.documentElement.scrollWidth > innerWidth,
          targets: [...el.querySelectorAll(".storefront-dock-target")].map(
            (a) => {
              const box = a.getBoundingClientRect(),
                range = document.createRange();
              range.selectNodeContents(a);
              const textRects = [...range.getClientRects()];
              const label = document.createRange();
              label.selectNodeContents(a.querySelector("span")!);
              return {
                text: a.textContent,
                width: box.width,
                height: box.height,
                labelLines: label.getClientRects().length,
                contained: textRects.every(
                  (r) =>
                    r.left >= box.left - 0.5 &&
                    r.right <= box.right + 0.5 &&
                    r.top >= box.top - 0.5 &&
                    r.bottom <= box.bottom + 0.5,
                ),
              };
            },
          ),
        };
      });
      expect(metrics.height).toBeCloseTo(76, 1);
      expect(metrics.overflow).toBe(false);
      for (const target of metrics.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.contained, target.text ?? "").toBe(true);
        expect(target.labelLines, target.text ?? "").toBe(1);
      }
      const controlRow = await page
        .locator(".moda-carousel-hero > .moda-carousel-controls")
        .boundingBox();
      expect(controlRow!.y + controlRow!.height).toBeLessThanOrEqual(
        (await dock.boundingBox())!.y,
      );
      await dock.getByRole("link").nth(1).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(dock.getByRole("link").nth(1)).toBeFocused();
      const toggle = dock.locator("summary");
      await toggle.focus();
      await page.keyboard.press("Enter");
      const menu = dock.locator(".storefront-dock-menu");
      await expect(menu.getByRole("link")).toHaveCount(3);
      await page.keyboard.press("Tab");
      await expect(menu.getByRole("link").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.tap();
      await expect(menu).toBeVisible();
      await dock.getByRole("link").first().tap();
      await expect(menu).toBeHidden();
      await page.screenshot({
        path: info.outputPath(`${locale}-${width}.png`),
      });
      await info.attach("word-layout", {
        body: JSON.stringify(metrics, null, 2),
        contentType: "application/json",
      });
      await dock.getByRole("link").nth(1).tap();
      await expect(page).toHaveURL(/\/c\//);
    });
  }
}
