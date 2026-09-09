import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe.configure({ mode: "serial" });
test("homepage preview is sandboxed, responsive and writes only on save", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/homepage");
  const before = await page.locator('input[name="blocks"]').inputValue();
  await page.getByLabel("افزودن بلوک").selectOption("RichText");
  await page.getByRole("button", { name: "افزودن بلوک", exact: true }).click();
  const input = page.getByLabel("متن (fa)").last();
  await input.fill("پیش‌نمایش زنده بدون ذخیره");
  const frame = page.getByTitle("پیش‌نمایش ذخیره‌نشده");
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(
    frame.contentFrame().getByText("پیش‌نمایش زنده بدون ذخیره"),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name="blocks"]')).toHaveValue(before);
});

test("UI override changes runtime text and reset restores file default", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/translations");
  await page
    .getByPlaceholder("جست‌وجوی کلید یا متن…")
    .fill("homepage.phase2Placeholder");
  const card = page.getByTestId("translation-homepage.phase2Placeholder");
  const replacement = `جایگزین ${Date.now()}`;
  await card.getByLabel("مقدار جایگزین").fill(replacement);
  await card.getByRole("button", { name: "ذخیره", exact: true }).click();
  await page.goto("/fa");
  await expect(page.getByText(replacement).first()).toBeVisible();
  await page.goto("/admin/content/translations");
  await page
    .getByPlaceholder("جست‌وجوی کلید یا متن…")
    .fill("homepage.phase2Placeholder");
  await page
    .getByTestId("translation-homepage.phase2Placeholder")
    .getByRole("button", { name: "بازگشت به پیش‌فرض" })
    .click();
});
