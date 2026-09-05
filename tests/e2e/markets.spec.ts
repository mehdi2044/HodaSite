import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ایران");
}

// Pin the market cookie explicitly rather than relying on the middleware
// having set it from a previous navigation — deterministic, and it isolates
// this test to exactly what acceptance criterion 3 claims: the gate reacts
// to enabledLocales for a *known* market context.
async function setMarketCookie(context: BrowserContext, code: string) {
  await context.addCookies([
    { name: "market", value: code, url: "http://127.0.0.1:3000" },
  ]);
}

// Acceptance criterion 3 (Phase 01a): market.enabledLocales gates both the
// storefront locale switcher and the middleware's locale redirect. IR ships
// fa-only by seed; this test proves the gate reacts live to an admin edit in
// both directions (enable, then disable again).
test("enabling/disabling a locale for market IR gates the switcher and the redirect", async ({
  page,
  context,
}) => {
  await ensureMaintenanceOff(page.request);
  await login(page);
  await setMarketCookie(context, "IR");

  await page.goto("/fa");
  await expect(page.getByRole("link", { name: "Türkçe" })).toHaveCount(0);

  // /tr under market IR is not yet enabled -> redirected to IR's default (fa)
  await page.goto("/tr");
  await expect(page).toHaveURL(/\/fa$/);

  // Enable Turkish for IR from the admin panel.
  await openIrMarketEdit(page);
  // getByLabel("Türkçe") also matches the defaultLocale <select> (its
  // wrapping <label>'s accessible name includes the concatenated <option>
  // text) — target the checkbox by role instead.
  await page.getByRole("checkbox", { name: "Türkçe" }).check();
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  // The storefront now offers Turkish, and /tr is no longer redirected away.
  await setMarketCookie(context, "IR");
  await page.goto("/fa");
  await expect(page.getByRole("link", { name: "Türkçe" })).toBeVisible();
  await page.goto("/tr");
  await expect(page).toHaveURL(/\/tr$/);

  // Disable it again (also restores the seeded demo state).
  await openIrMarketEdit(page);
  await page.getByRole("checkbox", { name: "Türkçe" }).uncheck();
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  await setMarketCookie(context, "IR");
  await page.goto("/fa");
  await expect(page.getByRole("link", { name: "Türkçe" })).toHaveCount(0);
  await page.goto("/tr");
  await expect(page).toHaveURL(/\/fa$/);
});
