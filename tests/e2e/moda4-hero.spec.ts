import { test, expect } from "@playwright/test";
import en from "../../messages/en.json";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { PrismaClient } from "@prisma/client";
import { homepageBlocksSchema } from "../../src/modules/content/homepage";

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
  const audit = page.getByTestId("hero-layout-audit");
  await expect(audit).toBeVisible();
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
