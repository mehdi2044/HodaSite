// Supplement the unchanged fidelity measurements with real scrolled section views.
// Offscreen reveal elements in a full-page capture are not a visual comparison.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = "test-results/moda4-fidelity";
const targets = {
  prototype:
    (process.env.MODA4_PROTOTYPE_URL ??
      pathToFileURL(
        path.resolve(
          "docs/design/moda4-redesign/prototype/MODA4-Redesign-v3.html",
        ),
      ).href) + "#home",
  app: (process.env.MODA4_APP_URL ?? "http://127.0.0.1:3000") + "/fa",
};
const sections = [
  "hero",
  "bands",
  "worlds-prism",
  "new-in",
  "fitting-ad",
  "shop-the-look",
  "lookbook",
  "kids-world",
  "services",
];
const requested = process.argv.slice(2);
if (requested.some((key) => !sections.includes(key)))
  throw Error("Unknown proof section");
const selected = requested.length ? requested : sections;
const browser = await chromium.launch(
  process.env.MODA4_CHROMIUM
    ? { executablePath: process.env.MODA4_CHROMIUM }
    : {},
);
try {
  for (const width of [1440, 390])
    for (const key of selected) {
      for (const [target, url] of Object.entries(targets)) {
        const page = await browser.newPage({
          viewport: { width, height: width === 1440 ? 900 : 844 },
          reducedMotion: "reduce",
        });
        await page.goto(url, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(900);
        const reject = page.getByTestId("consent-reject");
        if (await reject.isVisible()) await reject.click();
        let section = page.locator(`[data-moda4=${key}]`).first();
        if (
          target === "prototype" &&
          ["worlds-prism", "new-in", "lookbook"].includes(key)
        )
          section = page.locator("section").filter({ has: section }).first();
        if (target === "app" && key === "worlds-prism")
          section = page.locator(".moda-worlds-layout");
        await section.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(1400);
        // Inspect visibility without changing DOM/styles or forcing a reveal class.
        const opacity = await section.evaluate((e) => {
          let min = 1;
          for (let a = e; a; a = a.parentElement)
            min = Math.min(min, Number(getComputedStyle(a).opacity));
          return min;
        });
        if (opacity < 0.99)
          throw Error(
            `${target}/${key}/${width} did not reveal after actual scroll`,
          );
        const dir = path.join(root, "sections", target);
        fs.mkdirSync(dir, { recursive: true });
        await section.screenshot({
          path: path.join(dir, `${key}-${width}.png`),
        });
        await page.close();
      }
      const out = path.join(root, "compare");
      fs.mkdirSync(out, { recursive: true });
      const page = await browser.newPage({
        viewport: { width: width === 1440 ? 1580 : 840, height: 900 },
      });
      const image = (target) =>
        "data:image/png;base64," +
        fs
          .readFileSync(
            path.join(root, "sections", target, `${key}-${width}.png`),
          )
          .toString("base64");
      const w = width === 1440 ? 760 : 390;
      await page.setContent(
        `<body style="margin:0;padding:12px;display:flex;gap:24px;background:white;font:600 16px system-ui"><div>PROTOTYPE · actual scroll · reduced motion<img style="display:block;width:${w}px;margin-top:12px" src="${image("prototype")}"></div><div>APP · actual scroll · reduced motion<img style="display:block;width:${w}px;margin-top:12px" src="${image("app")}"></div></body>`,
      );
      await page.screenshot({
        path: path.join(out, `section-${key}-${width}.png`),
        fullPage: true,
      });
      await page.close();
      console.log(`Scrolled proof ${key}/${width}`);
    }
} finally {
  await browser.close();
}
