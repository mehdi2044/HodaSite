import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
const db = new PrismaClient();
test("mobile owner can open backup controls and queue a backup; anonymous download is denied", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await page.request.get("/api/admin/backups/download?key=unknown")
    ).status(),
  ).toBe(401);
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
  await page.goto("/admin/system/backups");
  await expect(
    page.getByRole("heading", { name: fa.backups.title }),
  ).toBeVisible();
  const before = await db.opsTask.count({ where: { type: "BACKUP" } });
  await page
    .getByRole("button", { name: fa.backups.BACKUP, exact: true })
    .click();
  await expect
    .poll(() => db.opsTask.count({ where: { type: "BACKUP" } }))
    .toBe(before + 1);
  await expect(
    page.getByRole("status").filter({ hasText: fa.backups.queued }),
  ).toBeVisible();
  await expect(page.locator('input[type="file"]')).toBeVisible();
  await page.locator('[name="hourUtc"]').fill("3");
  await page.locator('[name="minuteUtc"]').fill("30");
  await page
    .getByRole("button", { name: fa.backups.save, exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.backupSettings.findUnique({ where: { id: "default" } }))
          ?.minuteUtc,
    )
    .toBe(30);
  const settings = await db.backupSettings.findUniqueOrThrow({
    where: { id: "default" },
  });
  expect(settings.hourUtc).toBe(3);
  expect(
    (
      await page.request.get("/api/admin/backups/download?key=unknown")
    ).status(),
  ).toBe(403);
});
