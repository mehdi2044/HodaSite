import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
async function message(page: Page, email: string, minimum = 1) {
  let mail: { Text: string } | undefined;
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
          },
        });
        const inbox = await (
          await page.request.get(
            `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json();
        if ((inbox.messages?.length ?? 0) < minimum) return false;
        mail = await (
          await page.request.get(
            `${mailpit}/api/v1/message/${inbox.messages[0].ID}`,
          )
        ).json();
        return Boolean(mail?.Text.match(/\b[0-9]{6}\b/));
      },
      { timeout: 45000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  return mail!;
}
test("R6 real OTP resend/paste, direct themes and actual preference save/reload/clear in three languages", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  const email = `profile-${randomUUID()}@example.com`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await page.goto("/en/account/login");
  await page.locator('main input[name="email"]').fill(email);
  await page
    .locator("main form")
    .getByRole("button", { name: en.commerce.sendCode, exact: true })
    .click();
  await expect(page.getByTestId("otp-code")).toBeFocused();
  await message(page, email);
  const resend = page.getByRole("button", { name: /Resend in/ });
  await expect(resend).toBeDisabled();
  // Advance the presentation clock only; server OTP expiry/throttle stay real.
  await page.clock.fastForward(61000);
  await page
    .getByRole("button", { name: en.commerce.resend, exact: true })
    .click();
  const code = (await message(page, email, 2)).Text.match(/\b[0-9]{6}\b/)![0];
  const input = page.getByTestId("otp-code");
  await input.fill(
    code.replace(/[0-9]/g, (digit) =>
      String.fromCharCode(1776 + Number(digit)),
    ),
  );
  await expect(input).toHaveValue(code);
  await input.press("Backspace");
  await expect(input).toHaveValue(code.slice(0, 5));
  await input.press(code[5]);
  await page
    .locator("main form")
    .filter({ has: input })
    .getByRole("button", { name: en.commerce.login, exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/account$/);
  await expect(
    page.locator('.moda-auth-progress [aria-current="step"]'),
  ).toContainText(en.accountDesign.steps.profile);
  const actor = await db.customer.findUniqueOrThrow({ where: { email } });
  const variant = await db.variant.findUniqueOrThrow({
    where: { id: "seed-style-v2-women-tee-m" },
  });
  let version = actor.presentationVersion;
  try {
    for (const [locale, market, theme, copy] of [
      ["fa", "IR", "ROSE", fa],
      ["tr", "TR", "SLATE", tr],
      ["en", "CA", "SAND", en],
    ] as const) {
      await context.addCookies([
        { name: "market", value: market, url: info.project.use.baseURL! },
      ]);
      await page.goto(`/${locale}/account`);
      const selectedMarket = await db.market.findUniqueOrThrow({
        where: { code: market },
      });
      await expect(
        page.locator('select[name="preferredMarketId"]'),
      ).toHaveValue(selectedMarket.id);
      await page.locator('.moda-account-nav a[href="#appearance"]').click();
      const appearance = page.locator("#appearance"),
        form = appearance.locator("form");
      await appearance
        .getByRole("radio", {
          name: copy.accountDesign.themes[theme],
          exact: true,
        })
        .check();
      await appearance
        .locator(`input[name="sizeIds"][value="${variant.sizeId}"]`)
        .check();
      await appearance
        .locator('input[name="categoryIds"][value="seed-category-women"]')
        .check();
      // Native hash navigation must retain unsaved selections without saving them.
      await page.locator('.moda-account-nav a[href="#overview"]').click();
      await expect(appearance).not.toBeVisible();
      await page.goBack();
      await expect(appearance).toBeVisible();
      await expect(
        appearance.getByRole("radio", {
          name: copy.accountDesign.themes[theme],
          exact: true,
        }),
      ).toBeChecked();
      expect(
        (await db.customer.findUniqueOrThrow({ where: { id: actor.id } }))
          .presentationVersion,
      ).toBe(version);
      await page.goForward();
      await expect(appearance).not.toBeVisible();
      await page.locator('.moda-account-nav a[href="#appearance"]').click();
      await form
        .getByRole("button", { name: copy.accountDesign.save, exact: true })
        .click();
      version++;
      await expect
        .poll(
          async () =>
            (await db.customer.findUniqueOrThrow({ where: { id: actor.id } }))
              .presentationVersion,
        )
        .toBe(version);
      await expect(page.locator("main")).toHaveAttribute(
        "data-profile-theme",
        theme,
      );
      await page.reload();
      await expect(
        appearance.getByRole("radio", {
          name: copy.accountDesign.themes[theme],
          exact: true,
        }),
      ).toBeChecked();
      await expect(
        appearance.locator(`input[name="sizeIds"][value="${variant.sizeId}"]`),
      ).toBeChecked();
      expect(
        (await db.customer.findUniqueOrThrow({ where: { id: actor.id } }))
          .gender,
      ).toBeNull();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.locator('.moda-account-nav a[href="#overview"]').click();
      const image = info.outputPath(`r6-profile-${locale}-390.png`);
      await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: image, fullPage: true, scale: "css" });
      await info.attach(`profile-${locale}`, {
        path: image,
        contentType: "image/png",
      });
      if (locale === "en") {
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath("r6-profile-en-1440.png"),
          fullPage: true,
          scale: "css",
        });
        await page.setViewportSize({ width: 390, height: 844 });
      }
    }
    await page.locator('.moda-account-nav a[href="#appearance"]').click();
    const appearance = page.locator("#appearance");
    await appearance.locator("details summary").click();
    await appearance
      .getByRole("checkbox", {
        name: en.accountDesign.confirmClear,
        exact: true,
      })
      .check();
    await appearance
      .getByRole("button", { name: en.accountDesign.clear, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.customer.findUniqueOrThrow({ where: { id: actor.id } }))
            .presentationVersion,
      )
      .toBe(version + 1);
    await page.reload();
    const cleared = await db.customer.findUniqueOrThrow({
      where: { id: actor.id },
    });
    expect(cleared.profileTheme).toBeNull();
    expect(cleared.stylePreferences).toBeNull();
    expect(cleared.isActive).toBe(true);
    await expect(
      appearance.getByRole("radio", {
        name: en.accountDesign.themes.NEUTRAL,
        exact: true,
      }),
    ).toBeChecked();
    // Complete the real personal form after verifying the original empty-market fallback.
    await page.locator('.moda-account-nav a[href="#personal-details"]').click();
    const personal = page.locator("#personal-details form");
    await personal.locator('[name="firstName"]').fill("Sara");
    await personal.locator('[name="lastName"]').fill("Fixture");
    await personal
      .getByRole("button", { name: en.commerce.save, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.customer.findUniqueOrThrow({ where: { email } })).firstName,
      )
      .toBe("Sara");
    await page.reload();
    await page.locator('.moda-account-nav a[href="#appearance"]').click();
    await appearance
      .getByRole("radio", { name: en.accountDesign.themes.SAND, exact: true })
      .check();
    await appearance
      .getByRole("button", { name: en.accountDesign.save, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.customer.findUniqueOrThrow({ where: { email } }))
            .profileTheme,
      )
      .toBe("SAND");
    await page.locator('.moda-account-nav a[href="#overview"]').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("r6-profile-created-en-1440.png"),
      fullPage: true,
      scale: "css",
    });
  } finally {
    await db.customer.update({
      where: { id: actor.id },
      data: { isActive: false },
    });
  }
});
test("R6 actual admin account image selection persists and magic login still needs explicit confirmation", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const before = await db.themeSettings.findUniqueOrThrow({
    where: { id: "default" },
  });
  const media = await db.media.findUniqueOrThrow({
    where: { id: "seed-fashion-v2-look-women-coat" },
  });
  await page.goto("/admin/login");
  await page
    .locator('[name="email"]')
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator('[name="password"]')
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().addCookies([
    {
      name: "hoda.admin.locale",
      value: "en",
      url: info.project.use.baseURL!,
    },
  ]);
  const customer = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });
  const shop = await customer.newPage();
  let customerId = "";
  try {
    await page.goto("/admin/settings/theme");
    const picker = page
      .locator("div.grid.gap-1")
      .filter({ has: page.locator('input[name="accountMediaId"]') });
    await picker
      .getByRole("button", { name: en.media.chooseMedia, exact: true })
      .click();
    const dialog = picker.getByRole("dialog");
    await dialog.locator('input[type="search"]').fill(media.originalName);
    await dialog.getByTestId(`media-picker-item-${media.id}`).click();
    await page
      .getByRole("button", { name: en.themeEditor.save, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.themeSettings.findUniqueOrThrow({
              where: { id: "default" },
            })
          ).accountMediaId,
      )
      .toBe(media.id);
    await page.reload();
    await expect(page.locator('input[name="accountMediaId"]')).toHaveValue(
      media.id,
    );
    await shop.goto("/en/account/login");
    await expect(shop.locator(".moda-login-art img")).toBeVisible();
    await expect
      .poll(() =>
        shop
          .locator(".moda-login-art img")
          .evaluate(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
      )
      .toBe(true);
    await shop.screenshot({
      path: info.outputPath("r6-login-en-390.png"),
      fullPage: true,
      scale: "css",
    });
    const email = `magic-profile-${randomUUID()}@example.com`;
    await shop.locator('main input[name="email"]').fill(email);
    await shop
      .getByRole("button", { name: en.commerce.sendCode, exact: true })
      .click();
    const mail = await message(shop, email);
    const match = mail.Text.match(/https?:\/\/[^\s<>]+#challenge=[^\s<>]+/);
    expect(match).not.toBeNull();
    const url = new URL(match![0]);
    expect(url.origin).toBe(new URL(info.project.use.baseURL!).origin);
    await shop.goto(url.href);
    await expect(
      shop.getByText(en.commerce.magicConfirm, { exact: true }),
    ).toBeVisible();
    expect(
      (await customer.cookies()).some(
        (cookie) => cookie.name === "hoda.customer.session",
      ),
    ).toBe(false);
    await shop
      .getByRole("button", { name: en.commerce.login, exact: true })
      .click();
    await expect(shop).toHaveURL(/\/en\/account$/);
    customerId = (await db.customer.findUniqueOrThrow({ where: { email } })).id;
  } finally {
    await db.themeSettings.update({
      where: { id: "default" },
      data: { accountMediaId: before.accountMediaId },
    });
    if (customerId)
      await db.customer.update({
        where: { id: customerId },
        data: { isActive: false },
      });
    await customer.close();
  }
});
