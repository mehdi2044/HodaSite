/**
 * M4-01 (hero composition) and M4-02 ("From the rail to you") acceptance gate.
 * Contract: docs/design/moda4-redesign/m4-01-02/SPEC_M4-01_HERO.md and SPEC_M4-02_FITTING_AD.md
 *
 *   MODA4_FIDELITY_TARGET=prototype → self-test against the design reference (must be green)
 *   default                          → the running app (MODA4_APP_URL, seeded demo)
 *
 * These rules measure collisions and behaviour, not pixels; Mehdi still approves
 * from the side-by-side images (FIDELITY_SPEC AC-18).
 */
import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const TARGET =
  process.env.MODA4_FIDELITY_TARGET === "prototype" ? "prototype" : "app";
const ROOT = process.cwd();
const APP = process.env.MODA4_APP_URL ?? "http://127.0.0.1:3000";
const REF = pathToFileURL(
  path.join(ROOT, "docs/design/moda4-redesign/m4-01-02/reference"),
).href;
const AUDIT = fs.readFileSync(
  path.join(ROOT, "tests/fidelity/hero-audit.js"),
  "utf8",
);
const OUT = path.join(ROOT, "test-results/moda4-m4-01", TARGET);
const LOCALES = [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const;
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

async function openHero(
  page: Page,
  locale: string,
  market: string,
  slide: number,
) {
  if (TARGET === "prototype") {
    await page.goto(`${REF}/hero-reference.html?lang=${locale}&slide=${slide}`);
  } else {
    await page.goto(`${APP}/${locale}/m/${market}`);
    if (slide > 0)
      await page
        .locator("[data-moda4=hero-progress] button")
        .nth(slide)
        .click();
  }
  await page.evaluate(() => document.fonts.ready);
  // Selecting a below-fold carousel control may scroll it into view. Compare
  // the same top-of-page state as the reference, including the real header.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .locator("[data-moda4=hero-slide] img")
    .evaluateAll(async (images) => {
      await Promise.all(
        images
          .filter((image) => image.getClientRects().length > 0)
          .map((image) => (image as HTMLImageElement).decode()),
      );
    });
  await page.waitForTimeout(400); // layout guard runs on rAF after fonts/images
  await page.addScriptTag({ content: AUDIT });
}

test.describe("M4-01 hero composition", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } }); // no autoplay while measuring
  for (const vp of VIEWPORTS)
    for (const [locale, market] of LOCALES)
      test(`hero ${locale} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        fs.mkdirSync(OUT, { recursive: true });
        const slides =
          TARGET === "prototype"
            ? 4
            : await (await page.goto(`${APP}/${locale}/m/${market}`),
              page.locator("[data-moda4=hero-slide]").count());
        expect(slides).toBeGreaterThanOrEqual(3);
        const failures: string[] = [];
        const measurements: unknown[] = [];
        for (let n = 0; n < slides; n++) {
          await openHero(page, locale, market, n);
          const result = await page.evaluate(() =>
            (
              window as unknown as {
                MODA4Hero: {
                  auditHero: () => {
                    mode: string;
                    violations: { id: string; msg: string }[];
                  };
                };
              }
            ).MODA4Hero.auditHero(),
          );
          const box = await page.locator("[data-moda4=hero]").boundingBox();
          measurements.push({
            locale,
            market,
            viewport: vp,
            slide: n,
            ...result,
          });
          await page.screenshot({
            path: path.join(OUT, `hero-${locale}-${vp.name}-s${n}.jpg`),
            type: "jpeg",
            quality: 80,
            clip: {
              x: 0,
              y: 0,
              width: vp.width,
              height: Math.min(
                vp.height,
                (box?.y ?? 0) + (box?.height ?? vp.height),
              ),
            },
          });
          for (const v of result.violations)
            failures.push(`slide ${n} [${result.mode}] ${v.id}: ${v.msg}`);
        }
        fs.writeFileSync(
          path.join(OUT, `hero-${locale}-${vp.name}-measurements.json`),
          JSON.stringify(measurements, null, 2),
        );
        expect(failures, failures.join("\n")).toEqual([]);
      });
});
