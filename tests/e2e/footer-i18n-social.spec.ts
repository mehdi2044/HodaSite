import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ensureMaintenanceOff } from "./helpers/maintenance";
import { fillAdminMfa } from "./helpers/admin-mfa";

// Persian/Arabic script block — used to prove /tr and /en never render a
// Persian string (AGENTS §1: no hard-coded user-facing strings; PR #4
// review found the footer labels hard-coded in Persian regardless of locale).
const PERSIAN_RANGE = /[؀-ۿ]/;
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

async function loginAsAdmin(page: Page) {
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
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await ensureMaintenanceOff(page.request);
});

test("unconfigured public contacts omit known seed values in all markets", async ({
  page,
}) => {
  for (const [locale, market] of [
    ["fa", "IR"],
    ["tr", "TR"],
    ["en", "CA"],
  ]) {
    await page.goto(`/${locale}/m/${market}`);
    const footer = page.locator("footer");
    await expect(
      footer.locator('a[href*="example.com"], a[href*="stylehub"]'),
    ).toHaveCount(0);
    await expect(footer).not.toContainText(
      /\+\d[\d ]*0{4}|تهران، ایران|İstanbul, Türkiye|Toronto, Canada/,
    );
  }
});

test("a configured market-specific Telegram link only appears in its own market", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const settings = "/admin/settings/social";
  await page.goto(settings);
  const field = page.locator('input[name="IR_telegram"]');
  const original = await field.inputValue();
  const fixture = "https://t.me/moda4_scoped_fixture";
  async function save(value: string) {
    await field.fill(value);
    await field
      .locator("xpath=ancestor::form")
      .locator('button[type="submit"]')
      .click();
    await expect(
      field.locator("xpath=ancestor::form").getByRole("status"),
    ).toBeVisible();
  }
  await save(fixture);
  try {
    await page.goto("/fa/m/IR");
    await expect(page.locator(`footer a[href="${fixture}"]`)).toBeVisible();
    for (const route of ["/tr/m/TR", "/en/m/CA", "/fa/m/CA"]) {
      await page.goto(route);
      await expect(page.locator(`footer a[href="${fixture}"]`)).toHaveCount(0);
    }
  } finally {
    await page.goto(settings);
    await save(original);
  }
});

test("a market address saved from admin appears only for its market and language", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const market = await db.market.findUniqueOrThrow({
    where: { code: "CA" },
    select: { id: true },
  });
  const settings = `/admin/markets/${market.id}`;
  await page.goto(settings);
  const address = page.locator('input[name="addressFa"]');
  const original = await address.inputValue();
  const fixture = "نشانی آزمون بازار کانادا";
  async function save(value: string) {
    await address.fill(value);
    const form = address.locator("xpath=ancestor::form");
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole("status")).toBeVisible();
  }
  await save(fixture);
  try {
    await page.goto("/fa/m/CA");
    await expect(page.locator("footer")).toContainText(fixture);
    for (const route of ["/fa/m/IR", "/en/m/CA"]) {
      await page.goto(route);
      await expect(page.locator("footer")).not.toContainText(fixture);
    }
  } finally {
    await page.goto(settings);
    await save(original);
  }
});

// PR #4 review, P2: footer labels (contact/social headings, network names)
// were hard-coded Persian regardless of locale.
test("the footer has no Persian text on /tr or /en", async ({ page }) => {
  for (const path of ["/tr/m/TR", "/en/m/CA"]) {
    await page.goto(path);
    const footerText = await page.locator("footer").innerText();
    expect(PERSIAN_RANGE.test(footerText)).toBe(false);
  }
});
