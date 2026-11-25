import { test, expect } from "@playwright/test";

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const)
  for (const width of [390, 1440]) {
    test(`${locale}/${width}: physical worlds, catalogue destinations and keyboard`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/${locale}/m/${market}`);
      const worlds = page.locator(".moda-worlds-layout");
      await worlds.scrollIntoViewIfNeeded();
      await expect(worlds.locator(".moda-3d-orbit")).toHaveCSS(
        "transform-style",
        "preserve-3d",
      );
      const selectors = worlds.locator(".moda-carousel-tabs button");
      await expect(selectors).toHaveCount(4);
      for (let n = 0; n < 4; n++) {
        await selectors.nth(n).click();
        await expect(selectors.nth(n)).toHaveAttribute("aria-pressed", "true");
        const panel = worlds.locator(".moda-world-face").nth(n);
        await expect(panel).toBeVisible();
        await expect(panel.locator(".moda-world-products a")).toHaveCount(3);
        for (const image of await panel.locator("img:visible").all())
          await expect
            .poll(() =>
              image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
            )
            .toBeGreaterThan(0);
        for (const image of await worlds
          .locator(".moda-3d-face")
          .nth(n)
          .locator("img:visible")
          .all())
          await expect
            .poll(() =>
              image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
            )
            .toBeGreaterThan(0);
        await expect(panel.locator("a.button")).toHaveAttribute(
          "href",
          new RegExp(`^/${locale}/m/${market}/c/`),
        );
        await expect(
          worlds.locator(".moda-3d-face").nth(n),
        ).not.toHaveAttribute("inert", "");
      }
      await selectors.first().click();
      const stage = worlds.locator(".moda-carousel-stage");
      await stage.focus();
      await stage.press(locale === "fa" ? "ArrowLeft" : "ArrowRight");
      await expect(selectors.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect(worlds.locator(".moda-carousel-prism")).toHaveAttribute(
        "data-running",
        "false",
      );
      expect(errors).toEqual([]);
    });
    test(`${locale}/${width}: seamless ribbon and reduced motion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/m/${market}`);
      const ribbon = page.locator('[data-moda4="bands"]');
      await ribbon.scrollIntoViewIfNeeded();
      const decoration = await ribbon.locator("button").evaluate((button) => ({
        width: button.getBoundingClientRect().width,
        artWidth: parseFloat(getComputedStyle(button, "::before").width),
        content: getComputedStyle(button, "::before").content,
      }));
      if (decoration.content !== "none")
        expect(decoration.artWidth).toBeLessThanOrEqual(decoration.width + 24);
      const units = await ribbon
        .locator(".moda-band-unit")
        .evaluateAll((elements) =>
          elements.map((el) => ({
            width: (el as HTMLElement).offsetWidth,
            text: el.textContent,
          })),
        );
      expect(units).toHaveLength(4);
      expect(units[0]).toEqual(units[1]);
      expect(units[2]).toEqual(units[3]);
      await ribbon.locator("button").click();
      await expect(ribbon).toHaveAttribute("data-paused", "true");
      await expect(ribbon.locator(".moda-band-track").first()).toHaveCSS(
        "animation-play-state",
        "paused",
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(ribbon.locator(".moda-band-track").first()).toHaveCSS(
        "animation-name",
        "none",
      );
    });
    test(`${locale}/${width}: moving ribbon text stays visible in RTL and LTR`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(`/${locale}/m/${market}`);
      await page.evaluate(() => document.fonts.ready);
      const ribbon = page.locator('[data-moda4="bands"]');
      await page.mouse.move(0, 0);
      await ribbon.scrollIntoViewIfNeeded();
      await expect(ribbon).toHaveAttribute("data-paused", "false");
      const frames = await ribbon.evaluate(async (root) => {
        const frames: {
          at: number;
          bands: { visibleWords: number; x: number }[];
        }[] = [];
        const started = performance.now();
        do {
          const clip = root
            .querySelector(".moda-ribbons")!
            .getBoundingClientRect();
          const bands = [...root.querySelectorAll(".moda-band")].map(
            (band) => ({
              visibleWords: [...band.querySelectorAll("span")].filter(
                (span) => {
                  const box = span.getBoundingClientRect();
                  return (
                    Math.min(box.right, clip.right, innerWidth) -
                      Math.max(box.left, clip.left, 0) >
                      2 &&
                    Math.min(box.bottom, clip.bottom, innerHeight) -
                      Math.max(box.top, clip.top, 0) >
                      2
                  );
                },
              ).length,
              x: band.querySelector(".moda-band-track")!.getBoundingClientRect()
                .x,
            }),
          );
          frames.push({ at: performance.now() - started, bands });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        } while (performance.now() - started < 8000);
        return frames;
      });
      await info.attach("real-moving-ribbon-visibility", {
        body: JSON.stringify({ locale, width, frames }),
        contentType: "application/json",
      });
      expect(frames.length).toBeGreaterThan(2);
      expect(
        frames.every(
          (frame) =>
            frame.bands.length === 2 &&
            frame.bands.every((band) => band.visibleWords > 0),
        ),
      ).toBe(true);
      for (const band of [0, 1])
        expect(
          Math.abs(frames.at(-1)!.bands[band].x - frames[0].bands[band].x),
        ).toBeGreaterThan(1);
      await ribbon.screenshot({
        path: info.outputPath("moving-ribbon.png"),
        animations: "allow",
      });
    });
  }
