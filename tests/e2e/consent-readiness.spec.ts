import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
]) {
  for (const width of [390, 768, 1440]) {
    test(`${locale}/${width}: privacy controls wait for hydration and preserve reversible consent`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${locale}/m/${market}`);
      const settings = page.locator(".moda-privacy-settings");
      await page.getByTestId("consent-reject").click();
      const saved = () =>
        page.evaluate(() =>
          Object.entries(localStorage)
            .filter(([key]) => key.startsWith("consent:"))
            .map(
              ([, value]) =>
                (JSON.parse(value) as { accepted: boolean }).accepted,
            ),
        );
      await expect.poll(saved).toEqual([false]);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/_next/static/**/*.js", async (route) => {
        await gate;
        await route.continue();
      });
      try {
        await page.reload({ waitUntil: "commit" });
        await settings.scrollIntoViewIfNeeded();
        await expect(settings).toBeDisabled();
        await expect(settings).toHaveAttribute("aria-busy", "true");
        await expect(page.locator(".moda-consent-choice")).toHaveCount(2);
        for (const choice of await page.locator(".moda-consent-choice").all()) {
          await expect(choice).toBeDisabled();
        }
        // A real pointer action starts while scripts are unavailable. Native
        // disabled semantics make it wait instead of losing an early click.
        const clicked = settings.click();
        release();
        await clicked;
        await expect(page.locator(".moda-consent-panel")).toHaveCount(1);
        await expect(settings).toBeEnabled();
        await expect.poll(saved).toEqual([false]);
      } finally {
        release();
        await page.unrouteAll({ behavior: "wait" });
      }
      await page.locator(".moda-consent-choice").nth(1).click();
      await expect.poll(saved).toEqual([true]);
      await page.reload();
      await expect(settings).toBeEnabled();
      await expect(page.locator(".moda-consent-panel")).toHaveCount(0);
      await settings.click();
      await page.getByTestId("consent-reject").click();
      await expect.poll(saved).toEqual([false]);
      await page.reload();
      await expect(settings).toBeEnabled();
      await expect(page.locator(".moda-consent-panel")).toHaveCount(0);
      await settings.click();
      await expect(page.getByTestId("consent-reject")).toBeVisible();
    });
  }
}
