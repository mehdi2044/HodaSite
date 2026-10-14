import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
test("R7b real private health dashboard in three languages makes no provider request", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const external: string[] = [];
  page.on("request", (request) => {
    if (/api\.openai\.com|fashn|fal\.ai|replicate/.test(request.url()))
      external.push(new URL(request.url()).hostname);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/system/health");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page
    .locator('[name="email"]')
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator('[name="password"]')
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin\/system\/health$/);
  try {
    for (const [locale, copy] of [
      ["fa", fa],
      ["tr", tr],
      ["en", en],
    ] as const) {
      const language = page.locator('[name="adminLocale"]');
      if ((await language.inputValue()) !== locale)
        await Promise.all([
          page.waitForEvent("load"),
          language.selectOption(locale),
        ]);
      await page.goto("/admin/system/health");
      const panel = page.getByTestId("fitting-health");
      await expect(
        panel.getByRole("heading", {
          name: copy.fittingHealth.title,
          exact: true,
        }),
      ).toBeVisible();
      await expect(panel).toContainText(copy.fittingHealth.readOnly);
      await expect(panel).toContainText(copy.fittingHealth.heartbeatNote);
      await expect(panel).toContainText(copy.fittingHealth.refundNote);
      expect(
        await panel
          .getByText(copy.fittingHealth.unverified, { exact: true })
          .count(),
      ).toBeGreaterThanOrEqual(3);
      await expect(panel.locator("button,form,img")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const path = info.outputPath(`fitting-health-${locale}.png`);
      await panel.screenshot({ path, scale: "css" });
      await info.attach(`fitting-health-${locale}`, {
        path,
        contentType: "image/png",
      });
    }
    expect(external).toEqual([]);
  } finally {
    const language = page.locator('[name="adminLocale"]');
    if ((await language.inputValue()) !== "fa")
      await Promise.all([
        page.waitForEvent("load"),
        language.selectOption("fa"),
      ]);
  }
});
test("R7b signed-in denied actor cannot read fitting diagnostics", async ({
  page,
}) => {
  const role = await db.role.findUniqueOrThrow({ where: { key: "warehouse" } });
  const password = "Fixture-Health-123!";
  const user = await db.user.create({
    data: {
      email: `health-denied-${randomUUID()}@example.com`,
      name: "Synthetic health actor",
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
    await page.goto("/admin/system/health");
    await expect(
      page.getByRole("heading", { name: "404", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("fitting-health")).toHaveCount(0);
  } finally {
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
  }
});
