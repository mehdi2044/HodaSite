import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { TOTP } from "otpauth";
import { expect, test, type Page } from "@playwright/test";
import { seal } from "../../src/lib/secure-tokens";
const db = new PrismaClient(),
  password = "MfaBrowserTest123!";
async function user(enabled = false) {
  const role = await db.role.findUniqueOrThrow({ where: { key: "owner" } });
  return db.user.create({
    data: {
      email: `mfa-browser-${randomUUID()}@example.com`,
      name: "MFA browser",
      passwordHash: await bcrypt.hash(password, 4),
      mfaEnabled: enabled,
      mfaSecret: enabled ? seal("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP") : null,
      roles: { create: { roleId: role.id } },
    },
  });
}
async function login(page: Page, email: string, token = "") {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.locator('[name="token"]').fill(token);
  await page.getByRole("button", { name: "ورود امن" }).click();
}
test("owner enrollment, one-time recovery and session revocation in the real browser", async ({
  page,
}) => {
  test.setTimeout(90000);
  const account = await user();
  await login(page, account.email);
  await expect(page).toHaveURL(/\/admin\/security\/setup$/);
  expect((await page.request.get("/api/admin/media")).status()).toBe(401);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "نمایش کد راه‌اندازی" }).click();
  const secret = await page.getByTestId("mfa-secret").innerText();
  await page.locator('[name="token"]').fill(new TOTP({ secret }).generate());
  await page.getByRole("button", { name: "تأیید و فعال‌سازی" }).click();
  const codes = (await page.getByTestId("recovery-codes").innerText())
    .trim()
    .split("\n");
  expect(codes).toHaveLength(10);
  await page.getByRole("link", { name: "ورود دوباره با کد جدید" }).click();
  await login(page, account.email, codes[0]);
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().clearCookies();
  await login(page, account.email, codes[0]);
  await expect(page.getByRole("alert")).toBeVisible();
  await login(page, account.email, codes[1]);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/security");
  await page
    .getByText("همین نشست", { exact: true })
    .locator("../..")
    .getByRole("button", { name: "پایان نشست", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/login/);
  // A revoked, still-signed JWT must not cause /login -> /admin redirect loops.
  await page.reload();
  await expect(page.getByRole("heading", { name: "ورود مدیر" })).toBeVisible();
});
test("real TOTP is required, accepted once, and a revoked session cannot export orders", async ({
  page,
}) => {
  const account = await user(true);
  await login(page, account.email);
  await expect(page.getByRole("alert")).toBeVisible();
  const token = new TOTP({
    secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  }).generate();
  await login(page, account.email, token);
  await expect(page).toHaveURL(/\/admin$/);
  await db.user.update({
    where: { id: account.id },
    data: { sessionVersion: { increment: 1 } },
  });
  expect((await page.request.get("/admin/orders/export")).status()).toBe(401);
  await page.context().clearCookies();
  await login(page, account.email, token);
  await expect(page.getByRole("alert")).toBeVisible();
});
