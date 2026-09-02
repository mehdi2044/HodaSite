import { test, expect } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

test("unauthenticated /admin redirects to the login page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login(\?|$)/);
  await expect(page.getByRole("heading", { name: "ورود مدیر" })).toBeVisible();
});

test("unauthenticated /admin/users redirects and preserves next", async ({
  page,
}) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fusers/);
});

test("the seeded owner can log in and reach the dashboard", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "داشبورد" })).toBeVisible();
});

test("bad credentials show an inline error and stay on the login page", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill("nobody@example.com");
  await page.getByLabel("رمز عبور").fill("wrongpassword");
  await page.getByRole("button", { name: "ورود امن" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});
