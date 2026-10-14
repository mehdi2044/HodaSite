import { test, expect } from "@playwright/test";
import { fillAdminMfa } from "./helpers/admin-mfa";

test("permitted preview operator sees a saved brand change in the already-open storefront", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.HODASITE_PREVIEW !== "1",
    "Preview runtime is explicitly off in ordinary app tests",
  );
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
  const storefront = await context.newPage();
  await storefront.goto("/fa");
  const revision = storefront.locator("[data-preview-revision]");
  await expect(revision).toBeVisible();
  const before = await revision.textContent();
  await page.goto("/admin/settings/brand");
  const name = page.getByLabel("نام سایت (fa)");
  const original = await name.inputValue();
  const changed = `نسخهٔ آزمایشی ${Date.now()}`;
  try {
    await name.fill(changed);
    const started = Date.now();
    await page.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(page.getByText("ذخیره شد.", { exact: true })).toBeVisible();
    // No goto/reload on the open storefront: authenticated revision polling refreshes it.
    await expect(revision).not.toHaveText(before!, { timeout: 5000 });
    await expect(storefront).toHaveTitle(changed, { timeout: 5000 });
    expect(Date.now() - started).toBeLessThan(5000);
    await page.reload();
    await expect(name).toHaveValue(changed);
    await storefront.screenshot({
      path: test.info().outputPath("preview-runtime-mobile.png"),
      fullPage: true,
    });
    const response = await page.request.get("/api/admin/preview-status");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const anonymous = await context.browser()!.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    try {
      const denied = await anonymous.request.get("/api/admin/preview-status");
      expect(denied.status()).toBe(401);
    } finally {
      await anonymous.close();
    }
  } finally {
    await page.goto("/admin/settings/brand");
    await name.fill(original);
    await page.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(page.getByText("ذخیره شد.", { exact: true })).toBeVisible();
    await storefront.close();
  }
});
