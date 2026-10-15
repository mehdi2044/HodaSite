import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fillAdminMfa } from "./admin-mfa";
import fa from "../../../messages/fa.json";
import tr from "../../../messages/tr.json";
import en from "../../../messages/en.json";
const db = new PrismaClient();
export function registerUnsavedHistoryTests(
  engine: string,
  withoutNavigationApi = false,
) {
  test.afterAll(() => db.$disconnect());
  if (withoutNavigationApi)
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() =>
        Object.defineProperty(window, "navigation", {
          value: undefined,
          configurable: true,
        }),
      );
    });
  const scenarios = [
    ["fa", fa],
    ["tr", tr],
    ["en", en],
  ] as const;
  for (const [locale, messages] of withoutNavigationApi
    ? scenarios.slice(0, 1)
    : scenarios) {
    test(`history ${engine}${withoutNavigationApi ? " legacy" : ""} ${locale}: dirty Back and Forward warn without losing form values or indexed history`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width: 1280, height: 900 });
      const before = await db.siteSettings.findFirstOrThrow({
        select: { brand: true },
      });
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
      await page.locator('.sidebar a[href="/admin/settings/brand"]').click();
      await expect(page).toHaveURL(/\/admin\/settings\/brand$/);
      const field = page.locator('input[name="nameFa"]'),
        original = await field.inputValue(),
        dirty = `${original} unsaved history`;
      const length = await page.evaluate(() => history.length);
      let warnings = 0;
      let accept = false;
      page.on("dialog", async (dialog) => {
        warnings++;
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe(messages.adminShell.unsavedChanges);
        await (accept ? dialog.accept() : dialog.dismiss());
      });
      await field.fill(dirty);
      await page.evaluate(() => history.back());
      await expect.poll(() => warnings).toBe(1);
      await expect(page).toHaveURL(/\/admin\/settings\/brand$/);
      await expect(field).toHaveValue(dirty);
      expect(await page.evaluate(() => history.length)).toBe(length);
      accept = true;
      await page.evaluate(() => history.back());
      await expect(page).toHaveURL(/\/admin$/);
      expect(warnings).toBe(2);
      await page.evaluate(() => history.forward());
      await expect(page).toHaveURL(/\/admin\/settings\/brand$/);
      await expect(field).toHaveValue(original);
      await page.locator('.sidebar a[href="/admin/settings/contact"]').click();
      await expect(page).toHaveURL(/\/admin\/settings\/contact$/);
      await page.evaluate(() => history.back());
      await expect(page).toHaveURL(/\/admin\/settings\/brand$/);
      await field.fill(dirty);
      accept = false;
      const forwardLength = await page.evaluate(() => history.length);
      await page.evaluate(() => history.forward());
      await expect.poll(() => warnings).toBe(3);
      await expect(page).toHaveURL(/\/admin\/settings\/brand$/);
      await expect(field).toHaveValue(dirty);
      expect(await page.evaluate(() => history.length)).toBe(forwardLength);
      accept = true;
      await page.evaluate(() => history.forward());
      await expect(page).toHaveURL(/\/admin\/settings\/contact$/);
      expect(warnings).toBe(4);
      await page.evaluate(() => history.back());
      await expect(page).toHaveURL(/\/admin\/settings\/brand$/);
      await field.fill(dirty);
      await field.fill(original);
      await page.evaluate(() => history.forward());
      await expect(page).toHaveURL(/\/admin\/settings\/contact$/);
      expect(warnings).toBe(4);
      expect(
        (await db.siteSettings.findFirstOrThrow({ select: { brand: true } }))
          .brand,
      ).toEqual(before.brand);
    });
  }
}
