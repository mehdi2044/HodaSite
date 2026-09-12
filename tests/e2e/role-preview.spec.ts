import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
const db = new PrismaClient();
test("mobile role preview shows scoped access without changing owner privileges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login");
  await page
    .locator('[name="email"]')
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator('[name="password"]')
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const role = await db.role.findUniqueOrThrow({ where: { key: "warehouse" } }),
    tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } }),
    ir = await db.market.findUniqueOrThrow({ where: { code: "IR" } });
  await page.goto("/admin/security/roles/preview");
  await page.locator('[name="roleId"]').selectOption(role.id);
  await page.locator('[name="grant.marketId"]').selectOption(tr.id);
  await page.locator('[name="target.marketId"]').selectOption(ir.id);
  await page.getByRole("button", { name: fa.security.previewTitle }).click();
  await expect(
    page.getByText("order.view", { exact: true }).locator(".."),
  ).toContainText(fa.security.deny);
  await page.locator('[name="target.marketId"]').selectOption(tr.id);
  await page.getByRole("button", { name: fa.security.previewTitle }).click();
  await expect(
    page.getByText("order.view", { exact: true }).locator(".."),
  ).toContainText(fa.security.allow);
  await expect(
    page.getByText("pricing.sale_price.edit", { exact: true }).locator(".."),
  ).toContainText(fa.security.deny);
  await page.goto("/admin/security/roles");
  await expect(
    page.getByRole("heading", { name: fa.security.roles, exact: true }),
  ).toBeVisible();
});
