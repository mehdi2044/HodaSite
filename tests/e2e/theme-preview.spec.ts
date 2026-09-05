import { test, expect, type Page, type Locator } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
// The seeded value is literally "#E8792A" (prisma/seed.ts) — CSS custom
// property text preserves that casing verbatim (unlike input[type=color]'s
// DOM value, which the browser always lowercases).
const ORIGINAL_PRIMARY = "#E8792A";
const NEW_PRIMARY = "#00aaff";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function primaryVar(locator: Locator) {
  return locator.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--primary").trim(),
  );
}

/**
 * input[type=color] isn't a Playwright-"fillable" control, so this sets the
 * value and dispatches directly — but a plain `el.value = ...` is invisible
 * to React's onChange on a controlled input: React tracks the native value
 * setter itself and ignores a bare property assignment. Go through the
 * native setter (the standard React-controlled-input testing workaround) so
 * the dispatched "input" event actually fires the component's handler.
 */
async function setColor(locator: Locator, hex: string) {
  await locator.evaluate((el: HTMLInputElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, hex);
}

// Acceptance criterion 4 (Phase 01a): the preview iframe reflects an unsaved
// color change via postMessage, and after saving the real storefront (/fa)
// renders the new --color-primary.
test("theme editor live preview updates before saving, and /fa reflects it after saving", async ({
  page,
}) => {
  await ensureMaintenanceOff(page.request);
  await login(page);
  await page.goto("/admin/settings/theme");

  const mobilePreview = page.frameLocator('iframe[title="پیش‌نمایش موبایل"]');
  const root = mobilePreview.locator(":root");
  await expect(async () => {
    expect(await primaryVar(root)).toBe(ORIGINAL_PRIMARY);
  }).toPass();

  await setColor(page.locator('input[name="light_primary"]'), NEW_PRIMARY);

  // Pushed live via postMessage — no save yet.
  await expect(async () => {
    expect(await primaryVar(root)).toBe(NEW_PRIMARY);
  }).toPass();

  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  await page.goto("/fa");
  await expect(primaryVar(page.locator(":root"))).resolves.toBe(NEW_PRIMARY);

  // restore the seeded demo color
  await page.goto("/admin/settings/theme");
  await setColor(page.locator('input[name="light_primary"]'), ORIGINAL_PRIMARY);
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
});
