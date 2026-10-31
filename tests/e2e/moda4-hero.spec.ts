import { test, expect } from "@playwright/test";
import en from "../../messages/en.json";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { PrismaClient } from "@prisma/client";
import { homepageBlocksSchema } from "../../src/modules/content/homepage";
import { randomUUID } from "node:crypto";

test("legacy contained composite keeps the dressed model visible with reduced motion", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  try {
    const home = await db.homepage.findUniqueOrThrow({
      where: { id: "seed-homepage-global" },
    });
    const blocks = homepageBlocksSchema.parse(home.draftBlocks ?? home.blocks);
    const hero = blocks.find((block) => block.type === "HeroSlider");
    const fitting = blocks.find((block) => block.type === "FittingAd");
    if (hero?.type !== "HeroSlider" || fitting?.type !== "FittingAd")
      throw new Error("Demo scenes missing");
    const scene = fitting.looks[0].scene;
    const channel = randomUUID();
    await page.goto("/admin/login");
    await page
      .locator('[name="email"]')
      .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
    await page
      .locator('[name="password"]')
      .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
    await fillAdminMfa(page);
    await page.getByRole("button", { name: "ورود امن" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    const market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
    const response = await page.request.post("/api/admin/homepage/preview", {
      headers: { Origin: info.project.use.baseURL! },
      data: {
        channel,
        scopeMarketId: null,
        marketId: market.id,
        locale: "en",
        sequence: 1,
        blocks: [
          {
            ...hero,
            slides: [
              {
                ...hero.slides[0],
                layout: undefined,
                float: undefined,
                textSide: "end",
                scene: {
                  ...scene,
                  id: `legacy-${channel}`,
                  desktop: { ...scene.desktop, fit: "contain" },
                  mobile: { ...scene.mobile, fit: "contain" },
                },
              },
            ],
          },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/admin/preview/homepage?channel=${channel}`);
      const slide = page.locator("[data-moda4=hero-slide]:visible");
      const canvas = slide.locator(".m4-image-canvas:visible");
      await expect(canvas.locator("[data-scene-layer=true]")).toHaveCount(
        scene.pieces.length,
      );
      await canvas.locator("img").evaluateAll(async (images) => {
        await Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        );
      });
      await page.evaluate(() => document.fonts.ready);
      const purchase = slide.locator("details.moda-scene-purchase");
      if ((await purchase.getAttribute("open")) !== null)
        await purchase.locator("summary").press("Enter");
      await expect(purchase).not.toHaveAttribute("open", "");
      await slide.screenshot({
        path: info.outputPath(`legacy-composite-${width}.png`),
        scale: "css",
      });
      const [canvasBox, heroBox] = await Promise.all([
        canvas.boundingBox(),
        slide.boundingBox(),
      ]);
      expect(canvasBox!.y).toBeGreaterThanOrEqual(heroBox!.y);
      expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(
        heroBox!.y + heroBox!.height + 1,
      );
      expect(canvasBox!.x).toBeGreaterThanOrEqual(heroBox!.x);
      expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(
        heroBox!.x + heroBox!.width + 1,
      );
    }
  } finally {
    await db.$disconnect();
  }
});

test("a differently priced size updates the in-hero pin and purchase quote together", async ({
  page,
}) => {
  const db = new PrismaClient();
  const product = await db.product.findUniqueOrThrow({
    where: { id: "seed-moda4-style-women-coat" },
    include: {
      variants: { where: { isActive: true }, orderBy: { id: "asc" } },
    },
  });
  const variant = product.variants[0];
  try {
    await db.variant.update({
      where: { id: variant.id },
      data: { priceOverrideUsd: product.basePriceAmount.plus("17.25") },
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en/m/CA");
    const slide = page.locator("[data-moda4=hero-slide]:visible"),
      chip = slide.locator("[data-moda4=hero-prices] button").first();
    await expect(chip).toContainText("From");
    await chip.tap();
    const sheet = slide.locator("details.moda-scene-purchase");
    await sheet.locator("select").first().selectOption(variant.id);
    const exact = (
      await sheet.locator("strong.moda-price").first().innerText()
    ).trim();
    await expect(chip.locator(".moda-price")).toHaveText(exact);
    await expect(slide.locator(".m4-pin[data-n='1'] .moda-price")).toHaveText(
      exact,
    );
  } finally {
    await db.variant.update({
      where: { id: variant.id },
      data: { priceOverrideUsd: variant.priceOverrideUsd },
    });
    await db.$disconnect();
  }
});

test("hero pause and resize preserve the elapsed animation frame, resume continues it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/m/CA");
  await page.mouse.move(0, 0);
  const hero = page.locator("[data-moda4=hero]"),
    progress = hero.locator(".moda-slide-progress");
  await expect(hero).toHaveAttribute("data-running", "true");
  await expect
    .poll(() =>
      progress.evaluate((el) =>
        Number(el.getAnimations()[0]?.currentTime ?? 0),
      ),
    )
    .toBeGreaterThan(500);
  await hero
    .getByRole("button", { name: en.modaHomepage.pauseShort, exact: true })
    .click();
  const frozen = await progress.evaluate((el) =>
    Number(el.getAnimations()[0].currentTime),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  expect(
    Math.abs(
      (await progress.evaluate((el) =>
        Number(el.getAnimations()[0].currentTime),
      )) - frozen,
    ),
  ).toBeLessThan(30);
  await hero
    .getByRole("button", { name: en.modaHomepage.resumeShort, exact: true })
    .press("Enter");
  await expect(hero).toHaveAttribute("data-running", "true");
  const resumed = await progress.evaluate((el) =>
    Number(el.getAnimations()[0].currentTime),
  );
  expect(resumed).toBeGreaterThanOrEqual(frozen - 30);
  await expect
    .poll(() =>
      progress.evaluate((el) => Number(el.getAnimations()[0].currentTime)),
    )
    .toBeGreaterThan(frozen + 200);
  await page.locator("[data-moda4=header] a:visible").first().focus();
  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hero).toHaveAttribute("data-running", "false");
  const slide = await hero
    .locator("[data-moda4=hero-slide]:visible")
    .getAttribute("data-slide");
  await page.waitForTimeout(7500);
  expect(
    await hero
      .locator("[data-moda4=hero-slide]:visible")
      .getAttribute("data-slide"),
  ).toBe(slide);
});

test("a stale photographed garment cannot show a price pin or submit a set", async ({
  page,
}) => {
  const db = new PrismaClient();
  const home = await db.homepage.findUniqueOrThrow({
    where: { id: "seed-homepage-global" },
  });
  const hero = homepageBlocksSchema
    .parse(home.blocks)
    .find((b) => b.type === "HeroSlider")!;
  if (hero.type !== "HeroSlider") throw new Error("fixture");
  const product = await db.product.findUniqueOrThrow({
    where: { id: hero.slides[0].scene.pieces[0].productId },
  });
  try {
    await db.product.update({
      where: { id: product.id },
      data: { status: "ARCHIVED" },
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en/m/CA");
    const slide = page.locator("[data-moda4=hero-slide]:visible");
    await expect(slide.locator(".m4-unavailable")).toBeVisible();
    await expect(slide.locator(".m4-pin")).toHaveCount(0);
    await expect(slide.locator(".moda-scene-purchase button")).toHaveCount(0);
  } finally {
    await db.product.update({
      where: { id: product.id },
      data: { status: product.status },
    });
    await db.$disconnect();
  }
});

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`hero real touch, mouse, keyboard and set purchase ${locale}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${locale}/m/${market}`);
    const hero = page.locator("[data-moda4=hero]");
    const slide = hero.locator("[data-moda4=hero-slide]:visible");
    const sheet = slide.locator("details.moda-scene-purchase");
    const chip = slide.locator("[data-moda4=hero-prices] button").first();
    await chip.tap();
    await expect(sheet).toHaveAttribute("open", "");
    await expect(sheet.locator("select").first()).toBeFocused();
    await sheet.locator("summary").click();
    await page.setViewportSize({ width: 1440, height: 900 });
    const pin = slide.locator(".scene-pin:visible").first();
    await pin.click();
    await expect(sheet).toHaveAttribute("open", "");
    await sheet.locator("summary").click();
    await pin.press("Enter");
    await expect(sheet).toHaveAttribute("open", "");
    const heroBox = await hero.boundingBox(),
      sheetBox = await sheet.boundingBox();
    expect(sheetBox!.x).toBeGreaterThanOrEqual(heroBox!.x);
    expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(
      heroBox!.x + heroBox!.width,
    );
    const select = sheet.locator("select");
    const count = await select.count();
    expect(count).toBeGreaterThanOrEqual(2);
    await expect(
      sheet.locator("button[type=submit],button:not([type])"),
    ).toBeDisabled();
    for (let i = 0; i < count; i++) {
      const valid = select.nth(i).locator("option:not([disabled])").nth(1);
      await select.nth(i).selectOption((await valid.getAttribute("value"))!);
    }
    const add = sheet.locator("button[type=submit],button:not([type])");
    await expect(add).toBeEnabled();
    await add.click();
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((c) => c.name === "hoda.cart"),
      )
      .toBe(true);
    await page.goto(`/${locale}/cart`);
    await expect(page.locator(".shop-cart-item")).toHaveCount(count);
  });
}

test("admin privately measures every hero slide in 3 languages and 4 sizes", async ({
  page,
  context,
}, info) => {
  test.setTimeout(240000);
  await page.goto("/admin/login");
  await page
    .locator('[name="email"]')
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator('[name="password"]')
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await context.addCookies([
    { name: "hoda.admin.locale", value: "en", url: info.project.use.baseURL! },
  ]);
  await page.goto("/admin/content/homepage");
  const invalid = await page.getByTestId("homepage-form").evaluate((form) =>
    Array.from(
      form.querySelectorAll<HTMLInputElement>(
        "input:invalid,select:invalid,textarea:invalid",
      ),
      (field) => ({
        name: field.name,
        value: field.value,
        message: field.validationMessage,
      }),
    ),
  );
  expect(
    invalid,
    "Coordinate precision must not block normal draft saves",
  ).toEqual([]);
  const audit = page.getByTestId("hero-layout-audit");
  await expect(audit).toBeVisible();
  await audit.getByRole("button").click();
  await expect(audit.getByRole("button")).toBeEnabled({ timeout: 180000 });
  await expect(audit.getByRole("status")).toHaveText(
    en.modaAdmin.heroAuditPassed,
  );
  await page
    .getByLabel(en.modaAdmin.subjectEnd, { exact: true })
    .first()
    .fill("1");
  await page
    .getByLabel(en.modaAdmin.subjectStart, { exact: true })
    .first()
    .fill("0");
  await audit.getByRole("button").click();
  await expect(audit.getByRole("button")).toBeEnabled({ timeout: 180000 });
  await expect(audit).toContainText("H-01");
  await expect(audit).toContainText("1440×900");
  await expect(audit).toContainText("fa");
  await expect(audit).toContainText("tr");
  await expect(audit).toContainText("en");
  await audit.screenshot({ path: info.outputPath("hero-admin-warnings.png") });
});
