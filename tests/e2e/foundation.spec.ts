import { test, expect } from "@playwright/test";
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
test("Persian BiDi code is isolated", async ({ page }) => {
  await page.goto("/fa");
  const code = page.locator("bdi");
  await expect(code).toHaveAttribute("dir", "ltr");
  await expect(code).toHaveText("SH-MW-1023");
});
