import { fillAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

test("notification editor validates templates and sends through noop", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings/notifications");
  const template = page.locator("article", { hasText: "auth.otp" });
  await template.getByLabel("گیرندهٔ آزمایشی").fill("test@example.com");
  await template.getByRole("button", { name: "ارسال آزمایشی" }).click();
  await expect(template.getByRole("status")).toContainText("انجام شد");
  const englishBody = template.getByLabel("متن").last();
  const original = await englishBody.inputValue();
  await englishBody.fill("Secret {{password}}");
  await template.getByRole("button", { name: "ذخیرهٔ قالب" }).click();
  await expect(template.getByRole("status").first()).toContainText("نامعتبر");
  await englishBody.fill(original);
});
