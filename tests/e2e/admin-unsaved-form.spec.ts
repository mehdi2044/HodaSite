import { expect, test } from "@playwright/test";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

for (const [locale, messages] of [
  ["fa", fa],
  ["tr", tr],
  ["en", en],
] as const) {
  test(`${locale}: unsaved catalog and settings edits warn, cancellation preserves them and reverting removes the warning`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
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
    if (locale !== "fa") {
      await page.locator('select[name="adminLocale"]').selectOption(locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        messages.commerce.dashboard,
      );
    }
    for (const [route, selector] of [
      ["/admin/settings/brand", 'input[name="nameFa"]'],
      [
        "/admin/catalog/taxonomy?editKind=category&editId=seed-category-women",
        'form:has(input[name="kind"][value="category"]) input[name="nameFa"]',
      ],
    ]) {
      await page.goto(route);
      const field = page.locator(selector);
      const original = await field.inputValue();
      await field.fill(`${original} QA`);
      const cancelled = page.waitForEvent("dialog");
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe(messages.adminShell.unsavedChanges);
        await dialog.dismiss();
      });
      await page.locator('a[href="/admin"]').first().click();
      await cancelled;
      await expect(page).toHaveURL(new RegExp(route.split("?")[0]));
      await expect(field).toHaveValue(`${original} QA`);
      // Form data equality, rather than a sticky dirty flag, lets reverting an
      // edit recover clean navigation without a save or database mutation.
      await field.fill(original);
      let warnings = 0;
      const unexpected = async (dialog: import("@playwright/test").Dialog) => {
        warnings++;
        await dialog.dismiss();
      };
      page.on("dialog", unexpected);
      await page.locator('a[href="/admin"]').first().click();
      await expect(page).toHaveURL(/\/admin$/);
      expect(warnings).toBe(0);
      page.off("dialog", unexpected);
    }
  });
}
