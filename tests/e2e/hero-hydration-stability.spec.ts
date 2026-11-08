import { expect, test, type Locator } from "@playwright/test";

const markets = [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const;

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result!;
}

for (const [locale, market] of markets) {
  const route = `/${locale}/m/${market}`;

  test(`Hero ${locale}: a touch already in progress survives hydration`, async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Native split touch needs Chromium CDP",
    );
    await page.setViewportSize({ width: 412, height: 876 });
    let release!: () => void;
    const pendingScripts = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/_next/static/chunks/**", async (intercept) => {
      if (intercept.request().resourceType() === "script") await pendingScripts;
      await intercept.continue();
    });
    const slide = page.locator("[data-moda4=hero-slide]:visible");
    const chip = slide.locator("[data-moda4=hero-prices] button").first();
    const sheet = slide.locator("details.moda-scene-purchase");
    const cdp = await context.newCDPSession(page);
    try {
      await page.goto(route, { waitUntil: "commit" });
      await expect(chip).toBeVisible();
      await expect(slide).not.toHaveAttribute("data-mode", /./);
      await page.evaluate(() => document.fonts.ready);
      const before = await box(chip);
      const x = before.x + before.width / 2;
      const y = before.y + before.height / 2;
      const hit = () =>
        chip.evaluate(
          (el, point) =>
            el.contains(document.elementFromPoint(point.x, point.y)),
          { x, y },
        );
      expect(await hit()).toBe(true);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      release();
      await expect(slide).toHaveAttribute("data-mode", "A");
      const after = await box(chip);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(await hit()).toBe(true);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(sheet).toHaveAttribute("open", "");
      await expect(sheet.locator("select").first()).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    } finally {
      release();
      await cdp.detach();
    }
  });

  for (const width of [390, 1440]) {
    test(`Hero ${locale} at ${width}px: touch, mouse and keyboard open the in-slide sheet`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 850 : 900 });
      await page.goto(route);
      const slide = page.locator("[data-moda4=hero-slide]:visible");
      await expect(slide).toHaveAttribute(
        "data-mode",
        width === 390 ? "A" : "D",
      );
      const trigger =
        width === 390
          ? slide.locator("[data-moda4=hero-prices] button").first()
          : slide.locator(".scene-pin:visible").first();
      const sheet = slide.locator("details.moda-scene-purchase");
      for (const activate of [
        () => trigger.tap(),
        () => trigger.click(),
        () => trigger.press("Enter"),
      ]) {
        await activate();
        await expect(sheet).toHaveAttribute("open", "");
        await expect(sheet.locator("select").first()).toBeFocused();
        await expect(page).toHaveURL(new RegExp(`${route}$`));
        await sheet.locator("summary").click();
        await expect(sheet).not.toHaveAttribute("open", "");
      }
    });
  }
}

test("Hero budgets for the actual market suggestion and tablet navigation from first paint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.setExtraHTTPHeaders({ "x-vercel-ip-country": "IR" });
  let release!: () => void;
  const pendingScripts = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/chunks/**", async (intercept) => {
    if (intercept.request().resourceType() === "script") await pendingScripts;
    await intercept.continue();
  });
  try {
    await page.goto("/tr/m/TR", { waitUntil: "commit" });
    await expect(page.locator('[data-moda4="geo-suggestion"]')).toBeVisible();
    const hero = page.locator("[data-moda4=hero]");
    const chip = hero
      .locator(
        "[data-moda4=hero-slide]:visible [data-moda4=hero-prices] button",
      )
      .first();
    await expect(chip).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const before = await box(chip);
    const banner = await box(hero);
    // The server streams the navigation after the first Hero controls.
    // Require its SSR visibility before measuring; React scripts remain blocked.
    await expect(page.getByTestId("mobile-bottom-navigation")).toBeVisible();
    const nav = await box(page.getByTestId("mobile-bottom-navigation"));
    expect(Math.abs(banner.y + banner.height - nav.y)).toBeLessThanOrEqual(1);
    release();
    await expect(
      hero.locator("[data-moda4=hero-slide]:visible"),
    ).toHaveAttribute("data-mode", "B");
    expect(Math.abs((await box(chip)).y - before.y)).toBeLessThanOrEqual(1);
  } finally {
    release();
  }
});
