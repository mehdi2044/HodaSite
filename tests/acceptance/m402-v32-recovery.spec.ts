import { createHash } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import reference from "../fixtures/m4-02-approved-v32.json";

// This acceptance suite requires approved CMS/media v32, not fresh seed data.
// It is opt-in: ordinary e2e runs use a different fixture contract.
const locales = [
  ["fa", "IR"],
  ["en", "CA"],
  ["tr", "TR"],
] as const;
const adSelector = '[data-moda4="fitting-ad"]';

async function hit(control: Locator) {
  await control.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect
    .poll(() =>
      control.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    )
    .toBe(true);
  await control.click({ trial: true });
}

for (const [locale, market] of locales) {
  for (const width of [390, 1440]) {
    test(`${locale} ${width}: homepage grid, all controls and reduced motion`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`/${locale}/m/${market}`, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      const ad = page.locator(adSelector);
      await expect(ad.locator(".m4-scene-box")).toHaveAttribute(
        "data-still",
        "true",
      );
      const editorial = page.locator("#storefront-content > .editorial-home");
      if (process.env.M402_REQUIRE_EDITORIAL === "1")
        await expect(editorial).toHaveCount(1);
      if (await editorial.count()) {
        const boxes = await page
          .locator("#storefront-content")
          .evaluate((el) => {
            const home = el
              .querySelector(":scope > .moda-live-homepage")!
              .getBoundingClientRect();
            const extra = el
              .querySelector(":scope > .editorial-home")!
              .getBoundingClientRect();
            return { homeBottom: home.bottom, editorialTop: extra.top };
          });
        expect(boxes.editorialTop).toBeGreaterThanOrEqual(boxes.homeBottom);
      }
      await expect(ad.locator("[data-m4-look]")).toHaveCount(4);
      for (const look of reference.looks) {
        const button = ad.locator(`[data-m4-look="${look.id}"]`);
        await hit(button);
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        await expect(ad.locator(".m4-scene-box")).toHaveAttribute(
          "data-photo",
          "true",
        );
        await expect(ad.locator("[data-m4-stage]")).toHaveAttribute(
          "data-step",
          "look",
        );
        await expect(ad.locator(".m4-reveal img")).toHaveJSProperty(
          "complete",
          true,
        );
        await expect
          .poll(() =>
            ad
              .locator(".m4-reveal img")
              .evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      if (width === 390) {
        const dock = page.getByTestId("mobile-bottom-navigation");
        await expect(dock.locator(".storefront-dock-compact > a")).toHaveCount(
          4,
        );
        await expect(
          dock.locator(".storefront-dock-compact > details > summary"),
        ).toHaveCount(1);
        const more = dock.locator(
          ".storefront-dock-compact > details > summary",
        );
        await more.click();
        await expect(dock.locator("details")).toHaveAttribute("open", "");
        await more.press("Escape");
        await expect(dock.locator("details")).not.toHaveAttribute("open");
      }
      const cta = ad.locator("[data-moda4-cta]");
      await hit(cta);
      await page.screenshot({ path: info.outputPath("controls.png") });
      await cta.click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/fitting-room\\?market=${market}`),
      );
    });

    for (const look of reference.looks) {
      test(`${locale} ${width} ${look.modelId}: v32 flight, scan, final photo and Replay`, async ({
        page,
      }, info) => {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        const errors: string[] = [],
          networkFailures: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("requestfailed", (r) =>
          networkFailures.push(
            `${r.method()} ${r.url()} ${r.failure()?.errorText}`,
          ),
        );
        await page.goto(`/${locale}/m/${market}`, {
          waitUntil: "domcontentloaded",
        });
        await page.evaluate(() => document.fonts.ready);
        const ad = page.locator(adSelector),
          stage = ad.locator("[data-m4-stage]");
        // SSR buttons can precede hydration. Exercise the real handlers only
        // after the Stage effect has published its client-only clock state.
        await expect(stage).toHaveAttribute("data-running", /^(true|false)$/);
        const choice = ad.locator(`[data-m4-look="${look.id}"]`);
        await hit(choice);
        await choice.click();
        await expect(choice).toHaveAttribute("aria-pressed", "true");
        await expect(ad.locator(".m4-scene-box")).toHaveAttribute(
          "data-photo",
          "true",
        );
        await expect(stage.locator("[data-m4-layer]")).toHaveCount(
          look.pieces.length,
        );
        for (const piece of look.pieces) {
          const actual = await stage
            .locator(`[data-m4-layer="${piece.slot}"]`)
            .evaluate((el) => {
              const style = (el as HTMLElement).style;
              return {
                x: parseFloat(style.left) / 100,
                y: parseFloat(style.top) / 100,
                width: parseFloat(style.width) / 100,
                height: parseFloat(style.height) / 100,
              };
            });
          for (const key of ["x", "y", "width", "height"] as const)
            expect(actual[key]).toBeCloseTo(piece.target[key], 6);
        }
        // Keep the independent original-byte check outside Playwright's API
        // trace context; the browser trace still captures the rendered image.
        const baseURL = info.project.use.baseURL;
        if (!baseURL) throw new Error("Acceptance base URL is required");
        const original = await fetch(
          new URL("/media/" + look.photoStorageKey, baseURL),
        );
        expect(original.status).toBe(200);
        expect(
          createHash("sha256")
            .update(Buffer.from(await original.arrayBuffer()))
            .digest("hex"),
        ).toBe(look.photoSha256);
        const pause = ad.locator("[data-m4-pause]");
        for (let cycle = 0; cycle < 2; cycle++) {
          if (cycle) {
            const replay = ad.locator("[data-m4-replay]");
            await hit(replay);
            await replay.click();
          }
          await stage.scrollIntoViewIfNeeded();
          await expect(stage).toHaveAttribute("data-running", "true");
          await expect(stage).toHaveAttribute("data-step", "dress");
          await expect
            .poll(() =>
              stage
                .locator("[data-m4-flight]")
                .evaluateAll((nodes) =>
                  nodes.some(
                    (node) => Number(getComputedStyle(node).opacity) > 0.5,
                  ),
                ),
            )
            .toBe(true);
          if (!cycle)
            await stage.screenshot({
              path: info.outputPath("flight.png"),
              animations: "allow",
            });
          await expect(stage).toHaveAttribute("data-step", "style");
          await expect
            .poll(() =>
              stage
                .locator(".m4-scan")
                .evaluate((el) => Number(getComputedStyle(el).opacity)),
            )
            .toBeGreaterThan(0.5);
          if (!cycle)
            await stage.screenshot({
              path: info.outputPath("scan.png"),
              animations: "allow",
            });
          await expect(stage).toHaveAttribute("data-step", "look");
          await expect(stage.locator(".m4-reveal")).toHaveCSS("opacity", "1");
          await expect(stage.locator(".m4-reveal img")).toHaveJSProperty(
            "complete",
            true,
          );
          const photoSrc =
            (await stage.locator(".m4-reveal img").getAttribute("src")) ?? "";
          expect(
            photoSrc.includes(look.photoStorageKey) ||
              photoSrc.includes(look.photoMediaId),
          ).toBe(true);
          await pause.click();
          await expect(pause).toHaveAttribute("aria-pressed", "true");
          await stage.scrollIntoViewIfNeeded();
          await expect(stage).toHaveAttribute("data-running", "false");
          const clock = await stage.evaluate((el) =>
            (el as HTMLElement).style.getPropertyValue("--m4-time"),
          );
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              ),
          );
          expect(
            await stage.evaluate((el) =>
              (el as HTMLElement).style.getPropertyValue("--m4-time"),
            ),
          ).toBe(clock);
          await stage.screenshot({
            path: info.outputPath(cycle ? "replay-final.png" : "final.png"),
            animations: "allow",
          });
        }
        expect(
          errors.filter((e) => /#418|hydration|Connection closed/i.test(e)),
        ).toEqual([]);
        await info.attach("runtime-observation", {
          body: JSON.stringify({
            referenceBuildSha: reference.referenceBuildSha,
            contentVersion: 32,
            look,
            errors,
            networkFailures,
          }),
          contentType: "application/json",
        });
      });
    }
  }
}
