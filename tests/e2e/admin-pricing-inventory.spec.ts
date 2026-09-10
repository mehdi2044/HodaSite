import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("phase 03 admin exposes FX, method-specific fees and inventory", async ({
  page,
}) => {
  await login(page);

  await page.goto("/admin/pricing/fx");
  await expect(
    page.getByRole("heading", { name: "نرخ ارز و قیمت‌گذاری" }),
  ).toBeVisible();
  await expect(page.getByText("تنظیمات ارائه‌دهندگان نرخ")).toBeVisible();

  await page.goto("/admin/pricing/fees");
  await expect(
    page.getByRole("heading", { name: "قوانین هزینه" }),
  ).toBeVisible();
  const form = page
    .locator("form")
    .filter({ has: page.locator('select[name="method"]') })
    .first();
  await expect(form.locator('textarea[name="params"]')).toHaveCount(0);
  await form.locator('select[name="method"]').selectOption("PER_KG");
  await expect(form.getByPlaceholder("مبلغ هر کیلو")).toBeVisible();

  await page.goto("/admin/inventory");
  await expect(
    page.getByRole("heading", { name: "موجودی و دسته‌های خرید" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "موجودی جاری" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("seeded Canadian simulator reproduces CP2-03", async ({ page }) => {
  await login(page);
  await page.goto("/admin/pricing/fees/simulator");
  await page.locator('select[name="marketId"]').selectOption({ label: "CA" });
  await page.locator('select[name="variantId1"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "محاسبه" }).click();
  const quote = page.getByTestId("fee-quote");
  await expect(quote).toBeVisible();
  await expect(quote.locator("tr", { hasText: "SHIPPING" })).toContainText(
    "26",
  );
  await expect(quote.locator("tr", { hasText: "CUSTOMS" })).toContainText("16");
});

test("FX approval policy can be changed and survives reload", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/pricing/fx");
  const form = page
    .locator("form")
    .filter({ has: page.locator('select[name="fxMode"]') })
    .first();
  const policy = form.locator('select[name="fxMode"]');
  const original = await policy.inputValue();
  const changed =
    original === "AUTO_ACCEPT" ? "REQUIRE_APPROVAL" : "AUTO_ACCEPT";
  await policy.selectOption(changed);
  await form.getByRole("button").click();
  await expect(form.getByRole("status")).toBeVisible();
  await page.reload();
  await expect(policy).toHaveValue(changed);
  await policy.selectOption(original);
  await form.getByRole("button").click();
  await expect(form.getByRole("status")).toBeVisible();
});
