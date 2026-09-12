import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
const db = new PrismaClient();
test("mobile owner sees health badge, stale offsite status and 24-hour failures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login");
  await page
    .getByLabel("ایمیل")
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .getByLabel("رمز عبور")
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/system/health");
  await expect(
    page.getByRole("heading", { name: fa.healthAdmin.failures24h }),
  ).toBeVisible();
  await expect(
    page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: fa.healthAdmin.offsite,
          exact: true,
        }),
      })
      .getByText(fa.healthAdmin.offsiteStale, { exact: true }),
  ).toBeVisible();
  const count = await db.systemAlert.count({ where: { resolvedAt: null } });
  await expect(
    page.getByRole("link", {
      name: fa.healthAdmin.alertCount.replace("{count}", String(count)),
      exact: true,
    }),
  ).toBeVisible();
});

test("admin language persists on mobile while storefront URL retains its language", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login");
  await page
    .getByLabel("ایمیل")
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .getByLabel("رمز عبور")
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const locale of ["tr", "en", "fa"]) {
    await page.locator('select[name="adminLocale"]').selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    await page.reload();
    await expect(page.locator('select[name="adminLocale"]')).toHaveValue(
      locale,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator('select[name="adminLocale"]').selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/fa");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await page.goto("/admin/system/health");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
