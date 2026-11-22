import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  expect(
    await control.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return !!hit && node.contains(hit);
    }),
  ).toBe(true);
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
}

async function consent(page: Page) {
  return page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith("consent:"))
      .map(([, value]) => JSON.parse(value) as { accepted: boolean }),
  );
}

for (const locale of ["fa", "en", "tr"] as const) {
  for (const width of [320, 390, 768, 1024, 1440]) {
    test(`${locale}/${width}: footer, consent, installation and kids controls remain usable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const market = { fa: "IR", en: "CA", tr: "TR" }[locale];
      await page.goto(`/${locale}/m/${market}`);
      await page.evaluate(() => document.fonts.ready);
      const kids = page.locator('[data-moda4="kids-world"]');
      await expect(kids.locator(".moda-kids-decor")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      await expect(kids.locator(".moda-kids-decor svg")).toHaveCount(6);
      expect(
        await kids
          .locator(".moda-kids-decor")
          .evaluate((el) => el.getAnimations({ subtree: true }).length),
      ).toBe(0);
      for (const link of await kids.locator(".moda-kids-cta a").all())
        await reachable(link);
      const footer = page.locator("footer.moda-footer");
      const help = footer.locator(".pwa-install-help");
      const summary = help.locator("summary");
      await reachable(summary);
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(help).toHaveAttribute("open", "");
      await expect(help.locator("h3")).toHaveCount(2);
      await summary.focus();
      await page.keyboard.press("Space");
      await expect(help).not.toHaveAttribute("open", "");
      const reject = footer.getByTestId("consent-reject");
      await reachable(reject);
      await reject.click();
      expect((await consent(page))[0]?.accepted).toBe(false);
      await expect(footer.locator(".moda-consent-panel")).toHaveCount(0);
      const settings = footer.locator(".moda-privacy-settings");
      await reachable(settings);
      await settings.focus();
      await page.keyboard.press("Enter");
      const accept = footer.locator(".moda-consent-choice").last();
      await reachable(accept);
      // Equal prominence: both decisions retain the same treatment and target size.
      expect(await accept.getAttribute("class")).toBe(
        await reject.getAttribute("class"),
      );
      await accept.click();
      expect((await consent(page))[0]?.accepted).toBe(true);
      await settings.click();
      await expect(footer.locator(".moda-consent-panel p")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await footer.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await expect(footer.locator("nav a").first()).toHaveAttribute(
        "href",
        /.+/,
      );
      const violations = (
        await new AxeBuilder({ page })
          .include("footer.moda-footer")
          .withRules(["color-contrast", "button-name", "link-name"])
          .analyze()
      ).violations;
      expect(violations).toEqual([]);
    });
  }
}

for (const width of [390, 1440]) {
  test(`${width}: ambient motion is restrained, does not shift layout and pauses on focus`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/fa/m/IR");
    const kids = page.locator('[data-moda4="kids-world"]');
    await kids.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        kids
          .locator(".moda-kids-ring-stage")
          .evaluate((el) => el.style.getPropertyValue("--kids-ring-angle")),
      )
      .not.toBe("");
    await page.mouse.move(0, 0);
    const decor = kids.locator(".moda-kids-decor");
    const sample = () =>
      decor.evaluate((el) =>
        Array.from(el.querySelectorAll("svg"), (node) => ({
          transform: getComputedStyle(node).transform,
          state: getComputedStyle(node).animationPlayState,
          pointerEvents: getComputedStyle(node).pointerEvents,
        })),
      );
    const before = await sample();
    const box = await kids.locator(".moda-kids-copy").boundingBox();
    await page.waitForTimeout(1200); // Observe a real animation interval, without clock manipulation.
    const after = await sample();
    expect(
      after.some((entry, i) => entry.transform !== before[i].transform),
    ).toBe(true);
    expect(after.every((entry) => entry.pointerEvents === "none")).toBe(true);
    expect(await kids.locator(".moda-kids-copy").boundingBox()).toEqual(box);
    await kids.locator(".moda-kids-cta a").first().focus();
    expect((await sample()).every((entry) => entry.state === "paused")).toBe(
      true,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await decor.evaluate((el) => el.getAnimations({ subtree: true }).length),
    ).toBe(0);
  });
}
