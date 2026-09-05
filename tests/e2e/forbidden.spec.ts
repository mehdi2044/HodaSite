import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const OWNER_PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const LOW_EMAIL = `e2e-data-entry-${Date.now()}@example.com`;
const LOW_PASSWORD = "LowPrivPass123";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود امن" }).click();
}

// Acceptance criterion 6 (Phase 01a): a non-privileged role gets a localized
// "forbidden" message from the ForbiddenError -> ActionResult path, not a
// crash. (The companion structural check — no `new Error("FORBIDDEN")` left
// in src/ — is tests/unit/admin-authz.spec.ts.)
test("a data_entry user gets a localized forbidden message saving theme, not a crash", async ({
  page,
}) => {
  await login(page, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/users/new");
  await page.getByLabel("ایمیل").fill(LOW_EMAIL);
  await page.getByLabel("نام").fill("کاربر کم‌دسترسی");
  await page.getByLabel(/رمز عبور/).fill(LOW_PASSWORD);
  await page.getByLabel("نقش").selectOption("data_entry");
  await page.getByRole("button", { name: "ساخت کاربر" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  await login(page, LOW_EMAIL, LOW_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/settings/theme");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "شما اجازهٔ انجام این کار را ندارید",
  );
  // Still on the same page — a real crash would land on Next's error overlay
  // or an unstyled 500 page instead.
  await expect(page).toHaveURL(/\/admin\/settings\/theme$/);
});
