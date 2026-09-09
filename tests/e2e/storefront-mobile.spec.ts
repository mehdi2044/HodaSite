import { expect, test } from "@playwright/test";

test("390px Persian navigation is RTL, reachable and touch sized", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().clearCookies();
  await page.goto("/fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const toggle = page.getByLabel("ناوبری موبایل").first();
  const box = await toggle.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  const mobileNavigation = page.locator("details nav");
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link").first()).toBeVisible();
});
