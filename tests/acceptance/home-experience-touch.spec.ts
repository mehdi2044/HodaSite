import { test, expect } from "@playwright/test";

test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`${locale}: horizontal touch selects a world, vertical touch preserves it`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${locale}/m/${market}`);
    const worlds = page.locator(".moda-worlds-layout");
    const tabs = worlds.locator(".moda-carousel-tabs button");
    await worlds.scrollIntoViewIfNeeded();
    await tabs.first().click();
    const stage = worlds.locator(".moda-carousel-stage");
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = Math.max(210, Math.min(650, box!.y + box!.height / 2));
    const cdp = await context.newCDPSession(page);
    const move = async (dx: number, dy: number) => {
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
    };
    await move(locale === "fa" ? 110 : -110, 0);
    await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}$`));
    await move(0, -100);
    await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}$`));
  });
}
