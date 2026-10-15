import { expect, type Page } from "@playwright/test";

/** Follow the same navigation affordance on mobile and desktop. */
export async function followAdminLink(page: Page, href: string, label: string) {
  const link = page.locator(`.admin-navigation nav a[href="${href}"]`);
  // Locale changes reload the shell; wait for its translated destination first.
  await expect(link).toHaveText(label);
  const toggle = page.locator(".admin-menu-toggle");
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
  await expect(link).toBeVisible();
  await link.click();
}
