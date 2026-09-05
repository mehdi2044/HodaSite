import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const MAINT_SECRET = process.env.MAINTENANCE_SECRET ?? "test-maintenance";
const MESSAGE_FA = `پیام آزمایشی حفظ‌شونده ${Date.now()}`;
const ALLOWED_IP = "198.51.100.7";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function opsToggle(request: APIRequestContext, state: "on" | "off") {
  const res = await request.post("/api/system/maintenance", {
    headers: { "x-maintenance-secret": MAINT_SECRET },
    data: `state=${state}`,
  });
  expect(res.ok()).toBeTruthy();
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  await ensureMaintenanceOff(context.request);
  await context.close();
});

// PR #4 review, P1 (D23): the ops-driven toggle (what restore.sh calls) must
// invalidate the cached maintenance config, or the storefront gate can stay
// live while a restore is actually running.
test("the ops maintenance toggle invalidates the cache restore.sh depends on", async ({
  page,
}) => {
  await ensureMaintenanceOff(page.request);

  // Warm the cache while off.
  const before = await page.request.get("/fa");
  expect(before.status()).toBe(200);

  await opsToggle(page.request, "on");
  const during = await page.request.get("/fa");
  expect(during.status()).toBe(503);

  await opsToggle(page.request, "off");
  const after = await page.request.get("/fa");
  expect(after.status()).toBe(200);
});

// PR #4 review, P2: the ops endpoint must merge only `state`, not replace the
// whole JSON — otherwise every restore.sh cycle silently wipes the admin's
// configured message/allowlist.
test("the ops maintenance toggle preserves the admin-configured message and allowlist", async ({
  page,
}) => {
  await ensureMaintenanceOff(page.request);

  await login(page);
  await page.goto("/admin/settings/maintenance");
  await page.getByLabel("حالت").selectOption("off");
  await page.getByLabel("پیام (fa)").fill(MESSAGE_FA);
  await page.getByLabel("آی‌پی‌های مجاز").fill(ALLOWED_IP);
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  await opsToggle(page.request, "on");
  const state = await (
    await page.request.get("/api/system/maintenance/state")
  ).json();
  expect(state.effective).toBe(true);
  expect(state.message.fa).toBe(MESSAGE_FA);

  await opsToggle(page.request, "off");
  const stateAfter = await (
    await page.request.get("/api/system/maintenance/state")
  ).json();
  expect(stateAfter.message.fa).toBe(MESSAGE_FA);

  // Confirm the allowlist is still intact too, via the admin form itself.
  await page.goto("/admin/settings/maintenance");
  await expect(page.locator('textarea[name="allowlistIps"]')).toHaveValue(
    ALLOWED_IP,
  );
});
