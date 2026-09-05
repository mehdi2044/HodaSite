import { test, expect, type Page } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const ALLOWED_IP = "203.0.113.5";
const MESSAGE_FA = `سایت در حال تعمیر است ${Date.now()}`;

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function setMaintenance(page: Page, state: "off" | "on") {
  await page.goto("/admin/settings/maintenance");
  await page.getByLabel("حالت").selectOption(state);
  if (state === "on") {
    await page.getByLabel("پیام (fa)").fill(MESSAGE_FA);
    await page.getByLabel("آی‌پی‌های مجاز").fill(ALLOWED_IP);
  }
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
}

test.afterAll(async ({ browser }) => {
  // Go straight through the ops-secret flag rather than the admin UI form:
  // fewer moving parts to fail in a cleanup path, and other spec files
  // (which share this one server process/DB across the whole run) depend on
  // maintenance actually being off afterward, not just on this test's own
  // assertions having passed.
  const context = await browser.newContext();
  await ensureMaintenanceOff(context.request);
  await context.close();
});

// Acceptance criterion 2 (Phase 01a): the storefront shows a localized 503
// maintenance page; /admin and /api/health stay reachable; an allowlisted IP
// (simulated via X-Forwarded-For, since there's no real edge network here)
// bypasses the page.
test("maintenance mode blocks the storefront with a localized 503, exempts admin/health, and honours the IP allowlist", async ({
  page,
}) => {
  await login(page);
  await setMaintenance(page, "on");

  const blocked = await page.request.get("/fa");
  expect(blocked.status()).toBe(503);
  expect(await blocked.text()).toContain(MESSAGE_FA);

  const admin = await page.request.get("/admin/login");
  expect(admin.status()).toBe(200);

  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);

  const allowed = await page.request.get("/fa", {
    headers: { "x-forwarded-for": ALLOWED_IP },
  });
  expect(allowed.status()).toBe(200);

  await setMaintenance(page, "off");
  const restored = await page.request.get("/fa");
  expect(restored.status()).toBe(200);
});
