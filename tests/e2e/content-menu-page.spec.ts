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

test("published seeded menu opens a sanitized mixed-direction CMS page", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/pages/seed-page-about");

  const richText = page.getByRole("textbox", { name: "متن — فارسی" }).first();
  await richText.evaluate((element) => {
    element.innerHTML =
      '<p dir="rtl">کد کالا: <bdi dir="ltr">SH-MW-1023</bdi> موجود است</p>';
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  await page.goto("/fa");
  await page
    .getByRole("link", { name: "دربارهٔ ما", exact: true })
    .first()
    .click();
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe("/fa/pages/درباره-ما");
  await expect(page.locator('bdi[dir="ltr"]')).toHaveText("SH-MW-1023");
});

test("active content is rejected before it can be persisted", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/pages/seed-page-about");
  const unsafe = [
    {
      type: "RichText",
      html: {
        fa: "<script>alert(1)</script>",
        tr: "<p>TR</p>",
        en: "<p>EN</p>",
      },
    },
  ];
  await page.locator('input[name="blocks"]').evaluate((element, value) => {
    (element as HTMLInputElement).value = value;
  }, JSON.stringify(unsafe));
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("visual editor updates a sandboxed RTL preview without saving", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/pages/new");

  await page.getByLabel("نوع بلوک جدید").selectOption("CTA");
  await page.getByRole("button", { name: "افزودن بلوک" }).click();
  await page.getByLabel("عنوان — فارسی").fill("پیشنهاد امروز");
  await page.getByLabel("متن دکمه — فارسی").fill("مشاهده");
  await page.getByLabel("نشانی لینک").fill("/fa");

  const preview = page.getByTestId("unsaved-page-preview");
  await expect(preview).toHaveAttribute("sandbox", "");
  await expect(preview.contentFrame().getByText("پیشنهاد امروز")).toBeVisible();
  await expect(preview.contentFrame().locator("html")).toHaveAttribute(
    "dir",
    "rtl",
  );

  await page.getByRole("button", { name: "دسکتاپ ۱۲۸۰" }).click();
  await expect(preview).toHaveAttribute("style", /width: 1280px/);
  await expect(page.getByText("ذخیره شد.")).toHaveCount(0);
});
