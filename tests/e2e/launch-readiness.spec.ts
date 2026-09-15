import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { ensureMaintenanceOff } from "./helpers/maintenance";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();

test("a signed-in user without the health permission cannot read launch readiness", async ({
  page,
}) => {
  const role = await db.role.findUniqueOrThrow({ where: { key: "warehouse" } });
  const password = "Fixture-Launch-123!";
  const user = await db.user.create({
    data: {
      email: `launch-denied-${randomUUID()}@example.com`,
      name: "Launch permission fixture",
      passwordHash: await bcrypt.hash(password, 4),
      roles: { create: { roleId: role.id } },
      overrides: { create: { permission: "system.health.view", allow: false } },
    },
  });
  try {
    await page.goto("/admin/login");
    await page.locator('[name="email"]').fill(user.email);
    await page.locator('[name="password"]').fill(password);
    await page.getByRole("button", { name: "ورود امن" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    // Next can send 200 after a loading boundary has started streaming:
    // https://nextjs.org/docs/app/api-reference/file-conventions/not-found
    const response = await page.goto("/admin/system/launch");
    expect([200, 404]).toContain(response?.status());
    await expect(
      page.getByRole("heading", { name: "404", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("launch-page")).toHaveCount(0);
    await expect(page.locator('a[href="/admin/system/launch"]')).toHaveCount(0);
  } finally {
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
  }
});

test("launch readiness stays private and shows unverified gates in all locales on mobile", async ({
  page,
}) => {
  await ensureMaintenanceOff(page.request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/system/launch");
  await expect(page).toHaveURL(/\/admin\/login/);
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
  await page.goto("/admin/system/launch");
  // Streaming locale transitions can temporarily keep a hidden React copy.
  // Assert the single visible dashboard, which is what the user can access.
  const dashboard = page.locator('[data-testid="launch-page"]:visible');
  for (const [locale, messages] of [
    ["fa", fa],
    ["tr", tr],
    ["en", en],
  ] as const) {
    await page.locator('[name="adminLocale"]').selectOption(locale);
    await expect(dashboard).toHaveCount(1);
    await expect(
      dashboard.getByRole("heading", {
        name: messages.launch.title,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dashboard.getByRole("heading", { name: messages.launch.notReady }),
    ).toBeVisible();
    await expect(
      dashboard
        .getByTestId("launch-offsite")
        .locator('[data-status="blocked"]'),
    ).toBeVisible();
    await expect(dashboard.locator('[data-status="pending"]')).toHaveCount(14);
    await expect(dashboard.getByRole("checkbox")).toHaveCount(0);
    await expect(page.locator(".admin")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    const width = await page.evaluate(() => ({
      total: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(width.total).toBeLessThanOrEqual(width.viewport + 1);
  }
  await dashboard
    .getByRole("link", { name: en.launch.refresh, exact: true })
    .click();
  await expect(
    dashboard
      .getByTestId("launch-restoreDrill")
      .locator('[data-status="pending"]'),
  ).toBeVisible();
  await page.locator('[name="adminLocale"]').selectOption("fa");
  await expect(
    dashboard.getByRole("heading", { name: fa.launch.title, exact: true }),
  ).toBeVisible();
});
