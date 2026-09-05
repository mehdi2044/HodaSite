import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const ORIGINAL = { fa: "استایل هاب", tr: "STYLE HUB", en: "STYLE HUB" };
const NEW_NAME = `فروشگاه تست ${Date.now()}`;

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// Acceptance criterion 1 (Phase 01a): a brand-name save shows up as the new
// <title> on every locale on the very next load — no rebuild, no ISR delay.
test("changing the brand name updates <title> on fa/tr/en immediately", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/settings/brand");

  await page.getByLabel("نام سایت (fa)").fill(NEW_NAME);
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  for (const locale of ["fa", "tr", "en"]) {
    await page.goto(`/${locale}`);
    await expect(page).toHaveTitle(NEW_NAME);
  }

  // restore the seeded demo name
  await page.goto("/admin/settings/brand");
  await page.getByLabel("نام سایت (fa)").fill(ORIGINAL.fa);
  await page.getByLabel("نام سایت (tr)").fill(ORIGINAL.tr);
  await page.getByLabel("نام سایت (en)").fill(ORIGINAL.en);
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
  await page.goto("/fa");
  await expect(page).toHaveTitle(ORIGINAL.fa);
});
