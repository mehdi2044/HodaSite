// Supplemental real keyboard/UI proof on the synthetic seeded catalog only.
// It does not change the normative146-rule gate or inject a selection/consent.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = "test-results/moda4-fidelity";
const urls = {
  prototype:
    (process.env.MODA4_PROTOTYPE_URL ??
      pathToFileURL(
        path.resolve(
          "docs/design/moda4-redesign/prototype/MODA4-Redesign-v3.html",
        ),
      ).href) + "#fitting",
  app:
    (process.env.MODA4_APP_URL ?? "http://127.0.0.1:3000") + "/fa/fitting-room",
};
const browser = await chromium.launch(
  process.env.MODA4_CHROMIUM
    ? { executablePath: process.env.MODA4_CHROMIUM }
    : {},
);
try {
  for (const width of [1440, 390]) {
    for (const [target, url] of Object.entries(urls)) {
      const page = await browser.newPage({
        viewport: { width, height: width === 1440 ? 900 : 844 },
        reducedMotion: "reduce",
      });
      await page.goto(url, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const reject = page.getByTestId("consent-reject");
      if (await reject.isVisible()) await reject.click();
      if (target === "prototype") {
        await page.locator("#clearAll").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("[data-moda4=tryon-layer]")).toHaveCount(0);
      }
      for (const key of ["women-knit", "women-trousers"]) {
        const pick =
          target === "prototype"
            ? page.locator(`[data-ti="${key}"]`)
            : page.locator(
                `[data-product-id="seed-moda4-style-${key}"] .moda-instant-pick`,
              );
        await expect(pick).toBeEnabled();
        await pick.focus();
        await page.keyboard.press("Enter");
        if (target === "app")
          await expect(page.getByTestId("instant-fitting")).toHaveAttribute(
            "aria-busy",
            "false",
          );
      }
      const stage = page.locator("[data-moda4=tryon-stage]");
      await stage.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expect(stage.locator("[data-moda4=tryon-layer]")).toHaveCount(2);
      await expect
        .poll(() =>
          stage
            .locator("img")
            .evaluateAll((images) =>
              images.every((image) => image.complete && image.naturalWidth > 0),
            ),
        )
        .toBe(true);
      const dir = path.join(root, "sections", target);
      fs.mkdirSync(dir, { recursive: true });
      await stage.screenshot({
        path: path.join(dir, `fitting-selected-${width}.png`),
      });
      await page.close();
    }
    const page = await browser.newPage({
      viewport: { width: 1580, height: 900 },
    });
    const img = (target) =>
      "data:image/png;base64," +
      fs
        .readFileSync(
          path.join(root, "sections", target, `fitting-selected-${width}.png`),
        )
        .toString("base64");
    await page.setContent(
      `<body style="margin:0;padding:12px;display:flex;gap:24px;background:white;font:600 16px system-ui"><div>PROTOTYPE · two real UI selections<img style="display:block;width:750px;margin-top:12px" src="${img("prototype")}"></div><div>APP · two real validated variants<img style="display:block;width:750px;margin-top:12px" src="${img("app")}"></div></body>`,
    );
    fs.mkdirSync(path.join(root, "compare"), { recursive: true });
    await page.screenshot({
      path: path.join(root, "compare", `fitting-selected-${width}.png`),
      fullPage: true,
    });
    await page.close();
    console.log(`Real selected fitting proof/${width}`);
  }
} finally {
  await browser.close();
}
