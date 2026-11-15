import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { seedEditorialFixtures } from "../fixtures/editorial";
import { fillAdminMfa } from "./helpers/admin-mfa";

const db = new PrismaClient();
test.beforeAll(async () => {
  await seedEditorialFixtures(db);
});
test.afterAll(async () => db.$disconnect());

for (const { locale, market, width, name } of [
  { locale: "fa", market: "IR", width: 390, name: "روزهای راحت" },
  { locale: "tr", market: "TR", width: 768, name: "Rahat günler" },
  { locale: "en", market: "CA", width: 1440, name: "Easy Days" },
]) {
  test(`${locale} gallery filters and look at ${width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${locale}/m/${market}`);
    const section = page.locator(".editorial-home");
    await expect(section.locator(".editorial-card h2")).toHaveText(name);
    await section.locator('a[href$="/looks"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}/looks$`), {
      timeout: 60_000,
    });
    await expect(page.locator(".editorial-card")).toHaveCount(12);
    await page.screenshot({
      path: info.outputPath(`gallery-${width}.png`),
      fullPage: true,
    });
    await page.locator('select[name="audience"]').selectOption("MEN");
    await page.locator('select[name="season"]').selectOption("SPRING");
    await page.locator(".editorial-filters button").click();
    await expect(page).toHaveURL(/audience=MEN/, { timeout: 60_000 });
    await expect(page.locator(".editorial-card")).toHaveCount(3);
    await page
      .locator(".editorial-card h2")
      .getByText(name, { exact: true })
      .click();
    await expect(page.locator("h1")).toHaveText(name);
    await expect(page.locator(".editorial-piece")).toHaveCount(3);
    await expect(page.getByTestId("mobile-bottom-navigation")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`look-${width}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("story, color and sizes, idempotent set purchase, checkout and fitting preset", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/hydrati|Minified React error #41[89]/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/en/m/CA/magazine/everyday-look");
  await expect(
    page.getByRole("heading", { name: "How to build an everyday look" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Try this look", exact: true }).click();
  await expect(page).toHaveURL(/looks\/easy-days\?story=/);
  await page
    .locator(".editorial-piece")
    .nth(1)
    .getByLabel("Color", { exact: true })
    .selectOption({ index: 1 });
  for (const control of await page.getByLabel("Size", { exact: true }).all()) {
    const option = await control
      .locator("option[value]:not([value='']):not([disabled])")
      .first()
      .getAttribute("value");
    if (!option) throw new Error("Fixture has no in-stock variant");
    await control.selectOption(option);
  }
  await expect(page.locator(".editorial-total bdi")).toContainText(/[0-9]/);
  await page
    .getByRole("button", { name: "Add piece", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added to your bag." }),
  ).toBeVisible();
  const add = page.getByRole("button", { name: "Add available pieces" });
  await add.click();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(add).toBeEnabled();
  const fitting = await page
    .getByRole("link", { name: "Try this look", exact: true })
    .getAttribute("href");
  await page.goto("/en/cart?market=CA");
  const quantities = page.locator('main input[type="number"][name="quantity"]');
  await expect(quantities).toHaveCount(3);
  for (const quantity of await quantities.all())
    await expect(quantity).toHaveValue("1");
  await page.goto("/en/checkout?market=CA");
  await expect(page.locator(".shop-checkout-piece")).toHaveCount(3);
  await expect(page.getByTestId("mobile-bottom-navigation")).toBeVisible();
  const address = page
    .locator("form")
    .filter({ has: page.locator('[name="firstName"]') });
  await expect(address.locator("button[type=submit]")).toBeVisible();
  await address.locator("button[type=submit]").click({ trial: true });
  await page.screenshot({
    path: info.outputPath("checkout-dock-390.png"),
    fullPage: true,
  });
  expect(fitting).toContain("variants=");
  await page.goto(fitting!);
  await expect(
    page.getByRole("link", { name: "Back to the article" }),
  ).toHaveAttribute("href", "/en/m/CA/magazine/everyday-look");
  await expect(
    page.getByRole("link", { name: "Back to the look" }),
  ).toHaveAttribute("href", "/en/m/CA/looks/easy-days");
  await page.screenshot({
    path: info.outputPath("fitting-preset-390.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("authorized admin creates a draft, keeps preview private, publishes it, and schedules it", async ({
  page,
  request,
}) => {
  const slug = `qa-editorial-${randomUUID()}`;
  const name = "QA editorial look";
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
  await page.goto("/admin/content/editorial/new");
  for (const language of ["fa", "tr", "en"])
    await page.locator(`[name="slug-${language}"]`).fill(slug);
  const editor = page
    .locator("form")
    .filter({ has: page.locator('[name="body"]') });
  for (const input of await editor
    .locator("fieldset")
    .filter({ has: page.getByText("عنوان", { exact: true }) })
    .locator("input")
    .all())
    await input.fill(name);
  for (const input of await editor.locator("textarea").all())
    await input.fill("QA stage");
  await editor
    .getByLabel("تصویر شاخص", { exact: true })
    .selectOption({ index: 1 });
  await editor.getByRole("button", { name: "افزودن قطعه" }).click();
  const variant = editor.getByLabel("محصول و تنوع پیشنهادی");
  const real = await variant
    .locator("option")
    .filter({ hasText: /Bardia|بردیا/ })
    .first()
    .getAttribute("value");
  await variant.selectOption(real!);
  await editor.getByRole("button", { name: "ذخیرهٔ پیش‌نویس" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/editorial\/(?!new)[\w-]+$/);
  const publicUrl = `/fa/m/IR/looks/${slug}`;
  expect((await request.get(publicUrl)).status()).toBe(404);
  await page.getByText("تاریخچه و پیش‌نمایش", { exact: true }).click();
  const preview = await page
    .locator('a[href*="/preview?"]')
    .first()
    .getAttribute("href");
  const restricted = await request.get(preview!, { maxRedirects: 0 });
  expect(restricted.headers().location).toContain("/admin/login");
  await page.getByRole("button", { name: "تأیید انتشار" }).click();
  await expect
    .poll(async () => (await request.get(publicUrl)).status(), {
      timeout: 30000,
    })
    .toBe(200);
  const entry = await db.editorialEntry.findFirstOrThrow({
    where: { slugEn: slug },
  });
  expect(
    await db.auditLog.count({
      where: {
        entityId: entry.id,
        action: {
          in: ["content.editorial.draft", "content.editorial.publish"],
        },
      },
    }),
  ).toBe(2);
  await page.goto("/admin/content/editorial/weekly");
  await page.locator('select[name="id"]').selectOption(entry.id);
  await page.locator('select[name="slot"]').selectOption("WOMEN");
  const year = new Date().getUTCFullYear() + 2;
  await page.locator('[name="start"]').fill(`${year}-01-03T10:00`);
  await page.locator('[name="end"]').fill(`${year}-01-10T10:00`);
  await page.getByRole("button", { name: "ثبت برنامه" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "ذخیره شد." }),
  ).toBeVisible();
  expect(
    await db.weeklyLookFeature.count({
      where: { entryId: entry.id, slot: "WOMEN" },
    }),
  ).toBe(1);
  await page.goto(`/admin/content/editorial/${entry.id}`);
  await page.getByRole("button", { name: "بایگانی و پایان نمایش" }).click();
  await expect
    .poll(async () => (await request.get(publicUrl)).status(), {
      timeout: 30_000,
    })
    .toBe(404);
});
