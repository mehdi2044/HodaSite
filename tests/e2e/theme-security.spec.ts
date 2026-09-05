import { test, expect, type Page } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const PAYLOAD = "12px}</style><script>alert(1)</script><style>";

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// PR #4 review (P1): `radius` was validated only as a nonempty string and
// interpolated straight into a <style dangerouslySetInnerHTML>, so a value
// like PAYLOAD would plant a permanent <script> on every storefront/admin
// page. Now rejected by Zod (cssLength) before it ever reaches the DB.
test("a style-breakout radius payload is rejected with a readable error, not persisted", async ({
  page,
}) => {
  await ensureMaintenanceOff(page.request);
  await login(page);
  await page.goto("/admin/settings/theme");

  await page.locator('input[name="radius"]').fill(PAYLOAD);
  await page.getByRole("button", { name: "ذخیره" }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(
    "اطلاعات واردشده نامعتبر است",
  );

  // Never made it to the DB, so the real storefront page's HTML must not
  // contain the injected <script> tag.
  const html = await (await page.request.get("/fa")).text();
  expect(html).not.toContain("<script>alert(1)</script>");
});
