import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fillAdminMfa } from "./helpers/admin-mfa";
const db = new PrismaClient();
async function ownerLogin(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page
    .getByLabel("ایمیل")
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
test("owner manages a scoped role while a limited user cannot access security or exports", async ({
  page,
}) => {
  test.setTimeout(90000);
  const key = `browser_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    email = `role-browser-${randomUUID()}@example.com`,
    password = "RoleBrowser123!";
  await ownerLogin(page);
  await page.goto("/admin/security/roles");
  const create = page
    .locator("details")
    .filter({ has: page.getByText("نقش جدید", { exact: true }) });
  await create.locator("summary").click();
  await create.getByLabel("شناسه نقش", { exact: true }).fill(key);
  await create.getByLabel("نام نقش", { exact: true }).fill("نقش آزمایشی");
  await create
    .locator('[name="permissions"][value="catalog.product.view"]')
    .check();
  await create.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: key })).toBeVisible();
  await page.goto("/admin/users/new");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("نام", { exact: true }).fill("کاربر محدود");
  await page.getByLabel(/رمز عبور/).fill(password);
  await page.getByLabel("نقش", { exact: true }).selectOption(key);
  await page.getByLabel("بازار", { exact: true }).selectOption({ label: "TR" });
  await page.getByRole("button", { name: "ساخت کاربر" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  const target = await db.user.findUniqueOrThrow({
      where: { email },
      include: { roles: true },
    }),
    market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  expect(target.roles[0].scope).toEqual({ marketId: market.id });
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect((await page.request.get("/admin/security/roles")).status()).toBe(404);
  expect((await page.request.get("/admin/orders/export")).status()).toBe(403);
  expect((await page.request.get("/api/admin/media")).status()).toBe(403);
  await ownerLogin(page);
  await page.goto("/admin/security/audit?action=security.role.updated");
  await expect(
    page.getByRole("heading", { name: "سوابق تغییرات" }),
  ).toBeVisible();
  await expect(page.locator("summary").first()).toContainText(
    "security.role.updated",
  );
  await page.goto("/admin/system/health");
  await expect(
    page.getByRole("heading", { name: "سلامت سیستم", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "حجم دیتابیس" }),
  ).toBeVisible();
});
