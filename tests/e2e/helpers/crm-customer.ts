import { expect, type Page } from "@playwright/test";
export async function customerLogin(page: Page, email: string) {
  await page.goto("/en/account/login?next=/en/account/wishlist");
  await page.locator('main [name="email"]').fill(email);
  await page
    .locator("main form")
    .filter({ has: page.locator('[name="email"]') })
    .locator("button")
    .first()
    .click();
  await expect(page.locator('[name="code"]')).toBeVisible({ timeout: 45000 });
  let code = "";
  const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
          },
        });
        const result = await (
          await page.request.get(
            `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json();
        if (!result.messages?.length) return false;
        const mail = await (
          await page.request.get(
            `${mailpit}/api/v1/message/${result.messages[0].ID}`,
          )
        ).json();
        code = mail.Text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
        return code.length === 6;
      },
      { timeout: 45000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  await page.locator('[name="code"]').fill(code);
  // Auth can update the URL before CommerceForm's document navigation. Wait
  // for the new document, not an intermediate client-side URL transition.
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page
      .locator("main form")
      .filter({ has: page.locator('[name="code"]') })
      .locator("button")
      .first()
      .click(),
  ]);
  await expect(page).toHaveURL(/\/en\/account\/wishlist$/);
  await expect
    .poll(
      async () =>
        (await page.request.get("/api/customer-auth/session"))
          .json()
          .then((s: { user?: { id?: string } } | null) => Boolean(s?.user?.id)),
      { timeout: 15000 },
    )
    .toBe(true);
}
