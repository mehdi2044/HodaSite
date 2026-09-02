import { test, expect } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

const newEmail = `e2e-user-${Date.now()}@example.com`;
const newPassword = "NewUserPass123";

test.describe.configure({ mode: "serial" });

async function login(
  page: import("@playwright/test").Page,
  email: string,
  pw: string,
) {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(pw);
  await page.getByRole("button", { name: "ورود امن" }).click();
}

test("owner creates a user, then deactivates them, and the deactivated user cannot sign in", async ({
  page,
}) => {
  await login(page, EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  // create
  await page.goto("/admin/users/new");
  await page.getByLabel("ایمیل").fill(newEmail);
  await page.getByLabel("نام").fill("کاربر آزمایشی");
  await page.getByLabel(/رمز عبور/).fill(newPassword);
  await page.getByRole("button", { name: "ساخت کاربر" }).click();

  await expect(page).toHaveURL(/\/admin\/users$/);
  const row = page.locator("div", { hasText: newEmail }).last();
  await expect(row).toContainText("فعال");

  // the new user CAN sign in while active
  await page.goto("/admin/login");
  await login(page, newEmail, newPassword);
  await expect(page).toHaveURL(/\/admin$/);

  // owner deactivates them
  await login(page, EMAIL, PASSWORD);
  await page.goto("/admin/users");
  await page
    .locator("div", { hasText: newEmail })
    .last()
    .getByRole("button", { name: "غیرفعال‌کردن" })
    .click();
  await expect(page.locator("div", { hasText: newEmail }).last()).toContainText(
    "غیرفعال",
  );

  // deactivated user cannot sign in
  await page.context().clearCookies();
  await login(page, newEmail, newPassword);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});
