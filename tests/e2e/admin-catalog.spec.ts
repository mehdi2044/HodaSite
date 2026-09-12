import { fillAdminMfa } from "./helpers/admin-mfa";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admin catalog lists products and opens the complete editor", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/catalog/products");
  await expect(page.getByRole("heading", { name: "محصولات" })).toBeVisible();
  await expect(page.getByRole("link", { name: "محصول جدید" })).toBeVisible();
  await page.goto("/admin/catalog/products/seed-product-1");
  for (const tab of [
    "عمومی",
    "رسانه",
    "تنوع‌ها",
    "قیمت",
    "راهنمای سایز",
    "SEO",
    "بازارها",
    "انتشار",
  ])
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  await page.getByRole("tab", { name: "تنوع‌ها" }).click();
  await expect(page.getByText("ماتریس رنگ × سایز")).toBeVisible();
});

test("admin taxonomy exposes all six catalog entities", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/admin/catalog/taxonomy");
  for (const heading of [
    "برندها",
    "کالکشن‌ها",
    "رنگ‌ها",
    "سایزها",
    "دسته‌بندی‌ها",
    "راهنمای سایز",
  ])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "ویرایش" }).first().click();
  await expect(page).toHaveURL(/editKind=brand/);
  const editForm = page
    .locator("form")
    .filter({ has: page.locator('input[name="slug"]') })
    .first();
  await expect(editForm.locator('input[name="id"]')).toHaveValue(/seed-brand/);
});
