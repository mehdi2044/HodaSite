import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const widths = [390, 768, 1024, 1440];
const adSelector = '[data-moda4="fitting-ad"]';
const stageSelector = "[data-m4-stage]";
const countVisible = (nodes: Element[]) =>
  nodes.filter((node) => Number(getComputedStyle(node).opacity) > 0.5).length;

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(
    "Fitting ad " +
      locale +
      ": reduced motion, localised controls and responsive model",
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/" + locale + "/m/" + market, {
        waitUntil: "domcontentloaded",
      });
      const ad = page.locator(adSelector);
      const stage = ad.locator(stageSelector);
      await expect(ad).toHaveAttribute("data-state", "animated");
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await stage.scrollIntoViewIfNeeded();
        await expect(ad.locator(".m4-scene-box")).toHaveAttribute(
          "data-scene",
          width <= 760 ? "compact" : "wide",
        );
        await expect(stage).toHaveAttribute("data-step", "look");
        await expect(stage.locator("[data-m4-flight],.m4-scan")).toHaveCount(0);
        await expect(stage.locator(".m4-ready")).toHaveCSS("opacity", "1");
        await expect(stage).toHaveCSS("direction", "ltr");
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "fa" ? "rtl" : "ltr",
        );
        expect(
          await ad.evaluate((node) => node.getBoundingClientRect().right),
        ).toBeLessThanOrEqual(width + 1);
        await expect(ad.locator(".moda-price")).toHaveCount(0);
        const choice = ad.locator("[data-m4-look]").nth(1);
        await choice.scrollIntoViewIfNeeded();
        await expect(choice).toBeInViewport();
        expect(
          await choice.evaluate((button) => {
            const r = button.getBoundingClientRect();
            return button.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
        ).toBe(true);
      }
      const choice = ad.locator("[data-m4-look]").nth(1);
      await choice.click();
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      await expect(stage).toHaveAttribute("data-step", "look");
      expect(
        await stage.evaluate(
          (el) => el.getAnimations({ subtree: true }).length,
        ),
      ).toBe(0);
    },
  );
}

test("Fitting ad: the shared clock dresses the model, pauses, scans, replays and switches cleanly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const paid: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/(?:fitting|try-on|wallet|coins)/.test(request.url())
    )
      paid.push(request.url());
  });
  await page.goto("/fa/m/IR", { waitUntil: "domcontentloaded" });
  const ad = page.locator(adSelector),
    stage = ad.locator(stageSelector);
  const getTime = () =>
    stage.evaluate((el) =>
      Number((el as HTMLElement).style.getPropertyValue("--m4-time")),
    );
  await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute("data-running", "true");
  expect(
    await stage.locator("[data-m4-rack-piece]").count(),
  ).toBeGreaterThanOrEqual(3);
  await expect(stage).toHaveAttribute("data-step", "dress");
  const flights = stage.locator("[data-m4-flight]");
  await expect.poll(() => flights.evaluateAll(countVisible)).toBeGreaterThan(0);
  const pause = ad.locator("[data-m4-pause]");
  await pause.click();
  await expect(stage).toHaveAttribute("data-running", "false");
  const frozen = await getTime();
  const frame = () =>
    flights.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).transform),
    );
  const atPause = await frame();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await getTime()).toBe(frozen);
  expect(await frame()).toEqual(atPause);
  await pause.click();
  await expect.poll(getTime).toBeGreaterThan(frozen);
  await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute("data-step", "style");
  await expect
    .poll(() =>
      stage
        .locator(".m4-scan")
        .evaluate((node) => Number(getComputedStyle(node).opacity)),
    )
    .toBeGreaterThan(0.5);
  await expect(stage).toHaveAttribute("data-step", "look");
  await expect
    .poll(() => stage.locator("[data-m4-layer]").evaluateAll(countVisible))
    .toBeGreaterThanOrEqual(3);
  await expect(stage.locator(".m4-reveal")).toHaveCount(0);
  await expect(stage.locator("[data-m4-layer] img").first()).toHaveCSS(
    "object-fit",
    "contain",
  );
  await ad.locator("[data-m4-replay]").click();
  await expect(stage).toHaveAttribute("data-step", "pick");
  const boy = ad.locator("[data-m4-look]").nth(2);
  await boy.click();
  await expect(boy).toHaveAttribute("aria-pressed", "true");
  await expect(stage).toHaveAttribute("data-step", "pick");
  expect(paid).toEqual([]);
});

test("Fitting ad: controls pass the scoped accessibility scan", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/m/CA", { waitUntil: "domcontentloaded" });
  await page.locator(adSelector).scrollIntoViewIfNeeded();
  const results = await new AxeBuilder({ page })
    .include(adSelector)
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
