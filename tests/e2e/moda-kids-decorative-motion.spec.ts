import { test, expect } from "@playwright/test";

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  for (const width of [390, 768, 1440]) {
    test(`${locale}/${width}: bird, butterfly and light move in safe space and respect reduced motion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1600 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(`/${locale}/m/${market}`);
      await page.evaluate(() => document.fonts.ready);
      const kids = page.locator('[data-moda4="kids-world"]');
      await kids.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expect
        .poll(() =>
          kids
            .locator(".moda-kids-ring-stage")
            .evaluate((el) => el.style.getPropertyValue("--kids-ring-angle")),
        )
        .not.toBe("");
      const art = kids.locator(".moda-kids-decor > svg, .moda-kids-butterfly");
      await expect(art).toHaveCount(8);
      const before = await art.evaluateAll((nodes) =>
        nodes.map((el) => ({
          transform: getComputedStyle(el).transform,
          opacity: getComputedStyle(el).opacity,
        })),
      );
      const copy = await kids.locator(".moda-kids-copy").boundingBox();
      const observations = await kids.evaluate(async (world) => {
        const intersection = (a: DOMRect, b: DOMRect) =>
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        const outer = world.getBoundingClientRect();
        const moving = [
          ...world.querySelectorAll(
            ".moda-kids-decor > svg, .moda-kids-butterfly, .moda-kids-bird-wings, .moda-kids-butterfly-wing, .moda-kids-sun-halo",
          ),
        ];
        const seen = moving.map(() => new Set<string>());
        let samples = 0;
        const violations: string[] = [];
        const start = performance.now();
        await new Promise<void>((resolve) => {
          function sample(now: number) {
            moving.forEach((node, index) => {
              const style = getComputedStyle(node);
              seen[index].add(`${style.transform}/${style.opacity}`);
            });
            const protectedNodes = [
              ...world.querySelectorAll(
                ".moda-kids-copy h2, .moda-kids-copy p, .moda-kids-cta a, .moda-kids-visual, .moda-kids-label",
              ),
            ];
            for (const decor of world.querySelectorAll(
              ".moda-kids-bird, .moda-kids-butterfly",
            )) {
              const r = decor.getBoundingClientRect();
              if (
                r.left < outer.left ||
                r.right > outer.right ||
                r.top < outer.top ||
                r.bottom > outer.bottom
              )
                violations.push(
                  `${decor.getAttribute("class")}: outside section`,
                );
              for (const target of protectedNodes) {
                if (intersection(r, target.getBoundingClientRect()))
                  violations.push(
                    `${decor.getAttribute("class")}: overlaps ${target.getAttribute("class")}`,
                  );
              }
            }
            samples++;
            if (now - start < 12000) requestAnimationFrame(sample);
            else resolve();
          }
          requestAnimationFrame(sample);
        });
        return {
          samples,
          violations: [...new Set(violations)],
          moving: seen.map((frames) => frames.size > 1),
        };
      });
      expect(observations.samples).toBeGreaterThan(60);
      expect(observations.violations).toEqual([]);
      expect(observations.moving).toHaveLength(12);
      expect(observations.moving.every(Boolean)).toBe(true);
      const after = await art.evaluateAll((nodes) =>
        nodes.map((el) => ({
          transform: getComputedStyle(el).transform,
          opacity: getComputedStyle(el).opacity,
        })),
      );
      expect(
        after.some(
          (frame, i) =>
            frame.transform !== before[i].transform ||
            frame.opacity !== before[i].opacity,
        ),
      ).toBe(true);
      expect(await kids.locator(".moda-kids-copy").boundingBox()).toEqual(copy);
      const nested = kids.locator(
        ".moda-kids-bird-wings, .moda-kids-butterfly-wing, .moda-kids-sun-halo",
      );
      expect(
        await nested.evaluateAll((nodes) =>
          nodes.every((node) => node.getAnimations().length === 1),
        ),
      ).toBe(true);
      expect(
        await art.evaluateAll((nodes) =>
          nodes.every((el) => getComputedStyle(el).pointerEvents === "none"),
        ),
      ).toBe(true);
      expect(
        await art.locator("image, foreignObject, use[href^='http']").count(),
      ).toBe(0);
      await kids.locator(".moda-kids-cta a").first().focus();
      expect(
        await art.evaluateAll((nodes) =>
          nodes.every(
            (el) => getComputedStyle(el).animationPlayState === "paused",
          ),
        ),
      ).toBe(true);
      expect(
        await nested.evaluateAll((nodes) =>
          nodes.every(
            (el) => getComputedStyle(el).animationPlayState === "paused",
          ),
        ),
      ).toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await art.evaluateAll((nodes) =>
          nodes.every((el) => el.getAnimations({ subtree: true }).length === 0),
        ),
      ).toBe(true);
      const still = await art.evaluateAll((nodes) =>
        nodes.map((el) => getComputedStyle(el).transform),
      );
      await page.waitForTimeout(1200);
      expect(
        await art.evaluateAll((nodes) =>
          nodes.map((el) => getComputedStyle(el).transform),
        ),
      ).toEqual(still);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}
