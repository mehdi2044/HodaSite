import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function openIrMarketEdit(page: Page) {
  await page.goto("/admin/markets");
  await page
    .locator("tr", { hasText: "ایران" })
    .getByRole("link", { name: "ویرایش" })
    .click();
  await expect(page.getByRole("heading")).toContainText("ایران");
}

// Acceptance criterion 3 (Phase 01a): market.enabledLocales gates both the
// storefront locale switcher and the middleware's locale redirect. IR ships
// fa-only by seed; this test proves the gate reacts live to an admin edit in
// both directions (enable, then disable again).
test("enabling/disabling a locale for market IR gates the switcher and the redirect", async ({
  page,
}) => {
  await login(page);

  // Establish an IR market cookie by visiting the fa storefront once — the
  // middleware defaults an unset market cookie to IR for the fa locale.
  await page.goto("/fa");
  await expect(page.getByRole("link", { name: "Türkçe" })).toHaveCount(0);

  // /tr under market IR is not yet enabled -> redirected to IR's default (fa)
  await page.goto("/tr");
  await expect(page).toHaveURL(/\/fa$/);

  // Enable Turkish for IR from the admin panel.
  await openIrMarketEdit(page);
  await page.getByLabel("Türkçe").check();
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  // The storefront now offers Turkish, and /tr is no longer redirected away.
  await page.goto("/fa");
  await expect(page.getByRole("link", { name: "Türkçe" })).toBeVisible();
  await page.goto("/tr");
  await expect(page).toHaveURL(/\/tr$/);

  // Disable it again (also restores the seeded demo state).
  await openIrMarketEdit(page);
  await page.getByLabel("Türkçe").uncheck();
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  await page.goto("/fa");
  await expect(page.getByRole("link", { name: "Türkçe" })).toHaveCount(0);
  await page.goto("/tr");
  await expect(page).toHaveURL(/\/fa$/);
});
