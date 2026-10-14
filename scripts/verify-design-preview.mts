import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const output = "previews/design-01/evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.DESIGN_CHROMIUM_PATH,
});
const observations: Array<{
  locale: string;
  width: number;
  overflow: boolean;
}> = [];
try {
  for (const locale of ["fa", "tr", "en"]) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4310");
    await page.locator(".d-review-strip select").first().selectOption(locale);
    await page.locator(".d-approved-hero h1").waitFor();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await page.locator("img").evaluateAll((images) =>
        Promise.all(
          images.map((image) => {
            image.loading = "eager";
            return image.decode();
          }),
        ),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, `${locale} containment at ${width}`);
      await page.screenshot({
        path: `${output}/proposal-${locale}-${width}.png`,
        fullPage: true,
      });
      observations.push({ locale, width, overflow });
    }
    for (const market of ["IR", "TR", "CA"]) {
      await page.locator(".d-review-strip select").nth(1).selectOption(market);
      assert.equal(
        await page.locator(".d-review-strip select").nth(1).inputValue(),
        market,
      );
    }
    for (let group = 0; group < 4; group++) {
      await page.locator(".d-tabs button").nth(group).click();
      assert.equal(
        await page.locator(".d-tabs + .d-product-rail article").count(),
        5,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".d-category").first().click();
    await page.locator(".d-filterbar select").first().selectOption("empty");
    assert.equal(await page.locator(".d-state").count(), 1);
    await page.locator(".d-state button").click();
    await page.locator(".d-filterbar select").nth(1).selectOption("loading");
    assert.equal(await page.locator(".d-skeleton").count(), 1);
    await page.locator(".d-filterbar select").nth(1).selectOption("error");
    await page.locator(".d-state button").click();
    await page.screenshot({
      path: `${output}/category-${locale}-390.png`,
      fullPage: true,
    });
    await page.locator(".d-product a").first().click();
    await page.locator(".d-gallery > button").click();
    await page.locator("dialog.d-zoom[open]").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog.d-zoom").count(), 0);
    await page.locator(".d-buy").click();
    assert.match(await page.locator(".d-bag-link").innerText(), /\(0\)/);
    await page.locator(".d-choice button").filter({ hasText: "M" }).click();
    await page.locator(".d-buy").click();
    await page.screenshot({
      path: `${output}/product-${locale}-390.png`,
      fullPage: true,
    });
    await page.locator('.d-bottom a[href="#bag"]').click();
    await page.locator(".d-bag-item").waitFor();
    assert.match(await page.locator(".d-bag-item").innerText(), /M/);
    await page.locator(".d-bag-item input").fill("2");
    assert.equal(await page.locator(".d-bag-item input").inputValue(), "2");
    await page.screenshot({
      path: `${output}/bag-${locale}-390.png`,
      fullPage: true,
    });
    await page.locator('.d-bottom a[href="#editor"]').click();
    const title =
      locale === "fa"
        ? "پاییز، فصل لایه‌های آرام و انتخاب‌های تازه برای تمام اعضای خانواده"
        : "Autumn: a new chapter for everyday style";
    await page.locator("form input").first().fill(title);
    assert.equal(
      await page.locator(".d-editor-preview .d-campaign h2").innerText(),
      title,
    );
    await page.locator('form button[type="submit"]').click();
    await page.locator("form input").first().fill("Temporary edit");
    await page.locator('form button[type="button"]').click();
    assert.equal(await page.locator("form input").first().inputValue(), title);
    await page.locator('form input[type="checkbox"]').uncheck();
    assert.equal(
      await page.locator(".d-editor-preview .d-campaign").count(),
      0,
    );
    await page.locator('form input[type="checkbox"]').check();
    await page.screenshot({
      path: `${output}/editor-${locale}-390.png`,
      fullPage: true,
    });
    await page.locator(".d-pause").click();
    assert.equal(await page.locator(".d-paused").count(), 1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".d-campaign > img")
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    await page.locator('.d-bottom a[href="#home"]').click();
    await page.locator(".d-baseline-controls button").click();
    await page
      .locator(".d-comparison img")
      .evaluate((image: HTMLImageElement) => image.decode());
    assert.equal(
      (await page.request.get("http://127.0.0.1:4310/.env")).status(),
      404,
    );
    assert.equal(
      (await page.request.get("http://127.0.0.1:4310/api/checkout")).status(),
      404,
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  `${output}/observations.json`,
  JSON.stringify(
    {
      fixture: "main synthetic style catalog",
      backend: "none",
      physicalDevice: false,
      observations,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "DESIGN-01.1: 9 responsive captures and 3 localized navigation/editor/bag/keyboard/reduced-motion proofs passed.",
);
