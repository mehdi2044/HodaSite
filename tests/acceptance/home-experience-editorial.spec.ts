import { test, expect } from "@playwright/test";

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const)
  for (const width of [390, 1440]) {
    test(`${locale}/${width}: editorial placement, honest empty slot and one real story link`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`/${locale}/m/${market}`);
      const spotlight = page.locator('[data-moda4="editorial-spotlight"]');
      await spotlight.scrollIntoViewIfNeeded();
      await expect(spotlight).toHaveCount(1);
      expect(
        await page
          .locator(".moda-worlds-layout")
          .evaluate(
            (el) =>
              !!(
                el.compareDocumentPosition(
                  document.querySelector('[data-moda4="editorial-spotlight"]')!,
                ) & Node.DOCUMENT_POSITION_FOLLOWING
              ),
          ),
      ).toBe(true);
      expect(
        await spotlight.evaluate(
          (el) =>
            !!(
              el.compareDocumentPosition(
                document.querySelector('[data-moda4="shop-the-look"]')!,
              ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
      ).toBe(true);
      await expect(page.locator(".editorial-home")).toHaveCount(0);
      const weekly = spotlight.locator("[data-weekly-look-id]");
      await expect(weekly).toHaveAttribute(
        "data-weekly-look-id",
        "fixture-editorial-city-layers",
      );
      await expect(weekly.locator(".look-actions a")).toHaveCount(2);
      // The only published article is Easy Days: keep it with its shop look, not twice on the home.
      await expect(spotlight.locator(".home-spotlight-article")).toHaveCount(0);
      await expect(spotlight.locator(".home-spotlight-empty")).toBeVisible();
      const shop = page.locator('[data-moda4="shop-the-look"]');
      await shop.locator(".home-look-tabs button").nth(1).click();
      const story = shop.locator(
        '.home-look-studio[data-look-id="fixture-editorial-easy-days"] .home-look-story a',
      );
      await expect(story).toHaveCount(1);
      await expect(story).toHaveAttribute(
        "href",
        new RegExp(`^/${locale}/m/${market}/magazine/`),
      );
      await story.click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/m/${market}/magazine/`),
      );
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "fa" ? "rtl" : "ltr",
      );
      await page.goBack();
      await expect(spotlight).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

for (const width of [390, 768, 1024, 1280, 1440]) {
  test(`fa/${width}: measured sections and reachable actions above the dock`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/fa/m/IR");
    await page.locator(".home-look-tabs button").first().click();
    const measurements = await page
      .locator(".m4-home-remainder > *")
      .evaluateAll((elements) =>
        elements.map((el) => {
          const rect = el.getBoundingClientRect(),
            style = getComputedStyle(el);
          return {
            section: el.getAttribute("data-moda4") ?? el.className,
            height: rect.height,
            width: rect.width,
            paddingTop: parseFloat(style.paddingTop),
            paddingBottom: parseFloat(style.paddingBottom),
            textCharacters: el.textContent?.trim().length ?? 0,
            imageCount: el.querySelectorAll("img").length,
            linksAndButtons: el.querySelectorAll("a,button").length,
          };
        }),
      );
    await info.attach("layout-measurements", {
      body: JSON.stringify({ width, height: 900, measurements }, null, 2),
      contentType: "application/json",
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const targets = [
      page.locator(".moda-world-face").first().locator("a.button"),
      page.locator(".home-look-studio:visible .editorial-total > a"),
      page.locator(".home-spotlight-weekly .look-actions a").first(),
    ];
    for (const target of targets) {
      await target.scrollIntoViewIfNeeded();
      const hit = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const node = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        return {
          receivesPointer: node !== null && (el === node || el.contains(node)),
          width: r.width,
          height: r.height,
        };
      });
      expect(hit.receivesPointer).toBe(true);
      expect(hit.height).toBeGreaterThanOrEqual(44);
      expect(hit.width).toBeGreaterThanOrEqual(44);
    }
    const header = page.locator(
      ".home-curated-shop > .home-experience-heading",
    );
    const contentWidth = await page
      .locator(".home-curated-shop")
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return (
          el.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
        );
      });
    expect(
      Math.abs((await header.boundingBox())!.width - contentWidth),
    ).toBeLessThan(2);
    await expect(page.locator("footer")).toBeAttached();
  });
}
