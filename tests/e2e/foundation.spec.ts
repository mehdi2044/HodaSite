import { test, expect } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

for (const locale of ["fa", "tr", "en"])
  test(`${locale} mobile home`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("h1")).toContainText(
      locale === "fa" ? "استایل هاب" : "STYLE HUB",
    );
    await expect(page.locator("main")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
  });
test("admin login flow is localized", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading")).toContainText("ورود مدیر");
  await expect(page.getByRole("button")).toBeVisible();
});
test("Persian BiDi code is isolated (V-2, /admin/design)", async ({ page }) => {
  // The storefront never shows raw SKU/order/IBAN codes to visitors; this
  // demo lives in the internal design-system page instead (docs/06 V-2).
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/design");
  const code = page.locator("bdi", { hasText: "SH-MW-1023" });
  await expect(code).toHaveAttribute("dir", "ltr");
  await expect(code).toHaveText("SH-MW-1023");
});
