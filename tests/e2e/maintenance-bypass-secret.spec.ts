import { fillAdminMfa } from "./helpers/admin-mfa";
import { test, expect, type Page } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const ALLOWED_IP = "203.0.113.9";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  await ensureMaintenanceOff(context.request);
  await context.close();
});

// Phase 01b B2 (folded in from the PR #4 review): the public
// /api/system/maintenance/state endpoint must never let an outside caller
// probe the IP allowlist through ?ip= — only the middleware's own internal
// call (marked with x-internal-secret) gets a real bypass answer.
test("public callers of /api/system/maintenance/state always get bypass:false, even for an allowlisted ip", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/settings/maintenance");
  await page.getByLabel("حالت").selectOption("on");
  await page.getByLabel("پیام (fa)").fill("در حال تعمیر");
  await page.getByLabel("آی‌پی‌های مجاز").fill(ALLOWED_IP);
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  // A direct, unauthenticated hit — no x-internal-secret header, exactly what
  // any outside caller can send.
  const res = await page.request.get(
    `/api/system/maintenance/state?ip=${ALLOWED_IP}`,
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { effective: boolean; bypass: boolean };
  expect(body.effective).toBe(true);
  expect(body.bypass).toBe(false);

  // Meanwhile the actual storefront navigation from that same allowlisted IP
  // still bypasses — proving the middleware's own internal call still works
  // (it sends the header), only the public API answer changed.
  const allowed = await page.request.get("/fa", {
    headers: { "x-forwarded-for": ALLOWED_IP },
  });
  expect(allowed.status()).toBe(200);

  await page.goto("/admin/settings/maintenance");
  await page.getByLabel("حالت").selectOption("off");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
});
