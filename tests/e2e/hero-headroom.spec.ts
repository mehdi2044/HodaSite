import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  for (const width of [360, 390, 430, 1440]) {
    test(`Hero headroom ${locale} ${width}: every image stays below header; purchase remains accessible`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(`/${locale}/m/${market}`);
      const hero = page.locator("[data-moda4=hero]");
      const tabs = hero.locator(".moda-carousel-tabs > button");
      await expect(tabs).toHaveCount(4);
      for (let index = 0; index < 4; index++) {
        await tabs.nth(index).click();
        const slide = hero.locator("[data-moda4=hero-slide]:visible");
        await expect(slide).toHaveAttribute("data-slide", String(index));
        await expect(slide).toHaveAttribute(
          "data-mode",
          width < 761 ? "A" : "D",
        );
        await expect
          .poll(() =>
            slide
              .locator(".m4-media:visible img")
              .evaluateAll((images) =>
                images.every(
                  (image) =>
                    (image as HTMLImageElement).complete &&
                    (image as HTMLImageElement).naturalWidth > 0,
                ),
              ),
          )
          .toBe(true);
        await slide
          .locator(".m4-media:visible img")
          .evaluateAll(async (images) => {
            await Promise.all(
              images.map((image) => (image as HTMLImageElement).decode()),
            );
          });
        const geometry = await slide.evaluate((el) => {
          const header = document
            .querySelector("[data-moda4=header]")!
            .getBoundingClientRect();
          const box = el.getBoundingClientRect();
          const img = el.querySelector<HTMLImageElement>(
            ".m4-media-" + (innerWidth < 761 ? "mobile" : "desktop") + " img",
          )!;
          const transform = getComputedStyle(img).transform;
          return {
            headerBottom: header.bottom,
            top: box.top,
            imageTransform: transform,
            scrollWidth: document.documentElement.scrollWidth,
            viewport: innerWidth,
          };
        });
        expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
        expect(geometry.imageTransform).toBe("none");
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport);
        const chip = slide
          .locator(".m4-strip button:visible, .scene-pin:visible")
          .first();
        const sheet = slide.locator("details.moda-scene-purchase");
        for (const activate of [
          () => chip.tap(),
          () => chip.click(),
          () => chip.press("Enter"),
        ]) {
          await activate();
          await expect(sheet).toHaveAttribute("open", "");
          await expect(sheet.locator("select").first()).toBeFocused();
          await sheet.locator("summary").press("Enter");
          await expect(sheet).not.toHaveAttribute("open", "");
          await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}$`));
        }
        await page.screenshot({
          path: info.outputPath(`${locale}-${width}-slide-${index + 1}.png`),
          scale: "css",
          animations: "disabled",
        });
      }
    });
  }
}

test("Hero admin focal and zoom survive draft save/reload and drive the actual private preview", async ({
  page,
}) => {
  const { fillAdminMfa } = await import("./helpers/admin-mfa");
  await page.goto("/admin/login");
  await page.locator('[name="email"]').fill(process.env.ADMIN_EMAIL!);
  await page.locator('[name="password"]').fill(process.env.ADMIN_PASSWORD!);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/content/homepage");
  const field = page.locator('[data-hero-framing="mobile"]').first();
  if (!(await field.isVisible()))
    await field.locator("xpath=ancestor::details[1]/summary").click();
  const enabled = field.locator('input[type="checkbox"]');
  await expect(enabled).not.toBeChecked();
  await enabled.check();
  await field.locator('input[type="number"]').nth(0).fill("0.63");
  await field.locator('input[type="number"]').nth(1).fill("0.1");
  await field.locator('input[type="number"]').nth(2).fill("1.15");
  const preview = page.frameLocator('[data-testid="homepage-unsaved-preview"]');
  await expect
    .poll(() =>
      preview
        .locator("[data-moda4=hero-slide]")
        .first()
        .evaluate((el) => getComputedStyle(el).getPropertyValue("--fx").trim()),
    )
    .toBe("0.63");
  await expect
    .poll(() =>
      preview
        .locator("[data-moda4=hero-slide]")
        .first()
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--camera-zoom").trim(),
        ),
    )
    .toBe("1.15");
  const widthControl = page.getByRole("combobox", {
    name: "عرض پیش‌نمایش (پیکسل)",
    exact: true,
  });
  for (const otherWidth of ["360", "430"]) {
    await widthControl.selectOption(otherWidth);
    await expect
      .poll(() =>
        preview
          .locator("[data-moda4=hero-slide]")
          .first()
          .evaluate((el) =>
            getComputedStyle(el).getPropertyValue("--camera-x").trim(),
          ),
      )
      .toBe("");
  }
  await widthControl.selectOption("390");
  await expect
    .poll(() =>
      preview
        .locator("[data-moda4=hero-slide]")
        .first()
        .evaluate((el) => getComputedStyle(el).getPropertyValue("--fx").trim()),
    )
    .toBe("0.63");
  await page.locator('button[name="intent"][value="DRAFT"]').click();
  await expect(
    page.getByRole("status").filter({ hasText: "ذخیره" }),
  ).toBeVisible();
  await page.reload();
  if (!(await field.isVisible()))
    await field.locator("xpath=ancestor::details[1]/summary").click();
  await expect(enabled).toBeChecked();
  await expect(field.locator('input[type="number"]').nth(0)).toHaveValue(
    "0.63",
  );
  await expect(field.locator('input[type="number"]').nth(1)).toHaveValue("0.1");
  await expect(field.locator('input[type="number"]').nth(2)).toHaveValue(
    "1.15",
  );
  await enabled.uncheck();
  await page.locator('button[name="intent"][value="DRAFT"]').click();
  await expect(
    page.getByRole("status").filter({ hasText: "ذخیره" }),
  ).toBeVisible();
});

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  for (const width of [300, 360, 390, 430]) {
    test(`Hero short viewport ${locale} ${width}: retain photo space instead of compressing copy onto the face`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 640 });
      await page.goto(`/${locale}/m/${market}`);
      const hero = page.locator("[data-moda4=hero]");
      const tabs = hero.locator(".moda-carousel-tabs > button");
      for (let index = 0; index < 4; index++) {
        await tabs.nth(index).click();
        await page.locator(".storefront-skip-link").focus();
        await page.keyboard.press("Control+Home");
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
        const slide = hero.locator("[data-moda4=hero-slide]:visible");
        await expect(slide).toHaveAttribute("data-slide", String(index));
        const bounds = await slide.boundingBox();
        const header = await page.locator("[data-moda4=header]").boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(640);
        expect(bounds!.y).toBeGreaterThanOrEqual(
          header!.y + header!.height - 1,
        );
        const copy = await slide.locator(".m4-copy").boundingBox();
        expect(copy!.y - bounds!.y).toBeGreaterThan(180);
        await slide.locator(".m4-strip button").first().tap();
        await expect(
          slide.locator("details.moda-scene-purchase"),
        ).toHaveAttribute("open", "");
        await slide.locator("summary").press("Enter");
      }
    });
  }
}
