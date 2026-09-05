import { test, expect } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

// Persian/Arabic script block — used to prove /tr and /en never render a
// Persian string (AGENTS §1: no hard-coded user-facing strings; PR #4
// review found the footer labels hard-coded in Persian regardless of locale).
const PERSIAN_RANGE = /[؀-ۿ]/;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await ensureMaintenanceOff(page.request);
});

// PR #4 review, P2: social links are per-market now. The seed gives IR a
// Telegram link that TR and CA don't have.
test("a market-specific social link (IR's Telegram) only appears on IR's storefront", async ({
  page,
}) => {
  await page.goto("/fa"); // defaults to market IR
  await expect(
    page.locator("footer").getByRole("link", { name: "تلگرام" }),
  ).toBeVisible();

  await page.goto("/tr"); // defaults to market TR
  await expect(
    page.locator("footer").getByRole("link", { name: "Telegram" }),
  ).toHaveCount(0);

  await page.goto("/en"); // defaults to market CA
  await expect(
    page.locator("footer").getByRole("link", { name: "Telegram" }),
  ).toHaveCount(0);
});

// PR #4 review, P2: footer labels (contact/social headings, network names)
// were hard-coded Persian regardless of locale.
test("the footer has no Persian text on /tr or /en", async ({ page }) => {
  for (const locale of ["tr", "en"]) {
    await page.goto(`/${locale}`);
    const footerText = await page.locator("footer").innerText();
    expect(PERSIAN_RANGE.test(footerText)).toBe(false);
  }
});
