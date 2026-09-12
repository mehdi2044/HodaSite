import { test, expect } from "@playwright/test";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
for (const locale of ["fa", "tr", "en"] as const) {
  test(`${locale}: password visibility keeps the value, does not submit and hides on failed login`, async ({
    page,
    context,
  }, info) => {
    await context.addCookies([
      {
        name: "hoda.admin.locale",
        value: locale,
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/login");
    const t = { fa, tr, en }[locale].security;
    const password = page.locator('[name="password"]');
    await password.fill("VisibilityTest123!");
    await expect(password).toHaveAttribute("type", "password");
    await page
      .getByRole("button", { name: t.showPassword, exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("VisibilityTest123!");
    await expect(
      page.getByRole("button", { name: t.hidePassword, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page
      .getByRole("button", { name: t.hidePassword, exact: true })
      .press("Enter");
    await expect(password).toHaveAttribute("type", "password");
    await page.locator('[name="email"]').fill("visibility-test@example.com");
    await page
      .getByRole("button", { name: t.showPassword, exact: true })
      .click();
    await page.getByRole("button", { name: t.login, exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      t.loginError,
    );
    await expect(password).toHaveAttribute("type", "password");
    await expect(
      page.getByRole("button", { name: t.login, exact: true }),
    ).toBeEnabled();
    await shoppingProof(page, info, `admin-login-${locale}`);
  });
}
test("a credentials submission failure leaves login retryable and the password hidden", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.locator('[name="email"]').fill("offline-login@example.com");
  await page.locator('[name="password"]').fill("VisibilityTest123!");
  await page
    .getByRole("button", { name: fa.security.showPassword, exact: true })
    .click();
  await page.route("**/api/auth/callback/credentials*", (route) =>
    route.abort("failed"),
  );
  await page
    .getByRole("button", { name: fa.security.login, exact: true })
    .click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  await expect(page.locator('[name="password"]')).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("button", { name: fa.security.login, exact: true }),
  ).toBeEnabled();
});
