import { test, expect } from "@playwright/test";
for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const)
  for (const width of [390, 1440]) {
    test(`${locale}/${width}: unique editorial ring, continuous seam, keyboard and calm ambient`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/${locale}/m/${market}`);
      const book = page.locator(".home-curated-lookbook");
      await book.scrollIntoViewIfNeeded();
      const tabs = book.locator(".moda-carousel-tabs button");
      await expect(tabs).toHaveCount(5);
      const ids: string[] = [],
        photos: string[] = [];
      for (let index = 0; index < 5; index++) {
        await tabs.nth(index).click();
        const card = book.locator(
          '.moda-3d-face[data-active="true"] .home-lookbook-art',
        );
        ids.push((await card.getAttribute("data-look-id"))!);
        const visual = await card.getAttribute("data-look-visual");
        expect(visual).toMatch(/^(PHOTO|COMPOSITE):.+/);
        photos.push(visual!);
        await expect(card).toHaveAttribute(
          "href",
          new RegExp(`^/${locale}/m/${market}/looks/`),
        );
        const image = card.locator("img:visible").first();
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      expect(new Set(ids).size).toBe(5);
      expect(new Set(photos).size).toBe(5);
      const shopIds = await page
        .locator(".home-look-studio")
        .evaluateAll((elements) =>
          elements.map((el) => el.getAttribute("data-look-id")),
        );
      expect(ids.some((id) => shopIds.includes(id))).toBe(false);
      await expect(book.locator(".moda-3d-face").first()).toHaveCSS(
        "transform-style",
        "preserve-3d",
      );
      for (const side of await book
        .locator(
          '.moda-3d-face[aria-hidden="false"][data-active="false"] .home-lookbook-art',
        )
        .all()) {
        expect((await side.boundingBox())!.width).toBeGreaterThan(
          width === 390 ? 90 : 120,
        );
      }
      const composition = book.locator(
        '.moda-3d-face[data-active="true"] .look-composition',
      );
      if (await composition.count())
        expect((await composition.boundingBox())!.height).toBeGreaterThan(
          width === 390 ? 240 : 325,
        );
      const orbit = book.locator(".moda-3d-orbit");
      await expect(orbit).toHaveCSS("transform-style", "preserve-3d");
      const angle = async () =>
        Number(
          (await orbit.getAttribute("style"))!.match(
            /rotateY\(([-\d.]+)deg/,
          )![1],
        );
      const before = await angle();
      await book.locator(".moda-carousel-controls > button").nth(1).click();
      expect(Math.abs((await angle()) - before)).toBeCloseTo(72, 4);
      await expect(tabs.first()).toHaveAttribute("aria-pressed", "true");
      const stage = book.locator(".moda-carousel-stage");
      await stage.focus();
      await stage.press(locale === "fa" ? "ArrowLeft" : "ArrowRight");
      await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect(book.locator(".moda-carousel")).toHaveAttribute(
        "data-running",
        "false",
      );
      const kids = page.locator('[data-moda4="kids-world"]');
      await kids.scrollIntoViewIfNeeded();
      await expect(kids.locator(".moda-kids-decor > svg")).toHaveCount(6);
      await expect(kids.locator(".moda-kids-decor > span")).toHaveCount(0);
      await expect(kids.locator(".moda-kids-piece")).toHaveCount(5);
      for (const ambient of await kids.locator(".moda-kids-decor > svg").all())
        await expect(ambient).toHaveCSS("animation-name", "none");
      expect(errors).toEqual([]);
    });
  }

test.describe("lookbook touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
  for (const [locale, market] of [
    ["fa", "IR"],
    ["tr", "TR"],
    ["en", "CA"],
  ] as const)
    test(`${locale}: horizontal ring swipe and vertical scroll do not navigate a pictured link`, async ({
      page,
      context,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${locale}/m/${market}`);
      const book = page.locator(".home-curated-lookbook");
      const tabs = book.locator(".moda-carousel-tabs button");
      await book.scrollIntoViewIfNeeded();
      await tabs.first().click();
      const stage = book.locator(".moda-carousel-stage");
      await stage.scrollIntoViewIfNeeded();
      const box = (await stage.boundingBox())!;
      const x = box.x + box.width / 2,
        y = Math.max(210, Math.min(650, box.y + box.height / 2));
      const cdp = await context.newCDPSession(page);
      async function move(dx: number, dy: number) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 1 }],
        });
        for (let n = 1; n <= 8; n++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + (dx * n) / 8, y: y + (dy * n) / 8, id: 1 }],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      }
      await move(locale === "fa" ? 110 : -110, 0);
      await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
      await move(0, -100);
      await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}$`));
    });
});
