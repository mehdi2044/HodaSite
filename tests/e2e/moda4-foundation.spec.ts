import { test, expect } from "@playwright/test";
import { fillAdminMfa } from "./helpers/admin-mfa";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";

const copy = { en, fa, tr };
test.describe.configure({ mode: "serial" });
for (const locale of ["fa", "tr", "en"] as const) {
  test(`MODA4 font roles real admin preview/save/reload/storefront: ${locale}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    const fonts: string[] = [];
    page.on("request", (request) => {
      if (/font|woff/.test(request.url())) fonts.push(request.url());
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
    await context.addCookies([
      {
        name: "hoda.admin.locale",
        value: locale,
        url: test.info().project.use.baseURL!,
      },
    ]);
    await page.goto("/admin/settings/theme");
    const frame = page.frameLocator("iframe").first();
    const heading = page.locator('select[name="fontHeadingLatin"]');
    const initial = await heading.inputValue();
    const next = initial === "Manrope" ? "Inter" : "Manrope";
    const property = () =>
      frame
        .locator(":root")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--font-heading-latin"),
        );
    const initialOpacity = await page
      .locator('[name="lineOpacity"]')
      .inputValue();
    try {
      await heading.selectOption(next);
      await expect.poll(property).toContain(next);
      // A same-origin message from an unrelated window/nonce is ignored.
      await page.evaluate(() => {
        const target = document.querySelector("iframe")!.contentWindow!;
        target.postMessage(
          {
            type: "theme-preview",
            channel: "wrong-channel",
            vars: { primary: "#000000" },
            fonts: { headingLatin: "url(https://example.com/font)" },
          },
          location.origin,
        );
      });
      await expect.poll(property).toContain(next);
      await page.locator('[name="lineOpacity"]').fill("0.2");
      await page
        .getByRole("button", {
          name: copy[locale].themeEditor.save,
          exact: true,
        })
        .click();
      await expect(
        page.getByText(copy[locale].themeEditor.saved, { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(heading).toHaveValue(next);
      await expect(page.locator('[name="lineOpacity"]')).toHaveValue("0.2");
      await page.goto(`/${locale}/m/CA`);
      const root = page.locator(":root");
      await expect(
        root.evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--font-heading-latin"),
        ),
      ).resolves.toContain(next);
      await expect(
        page
          .getByRole("heading")
          .first()
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).resolves.toContain(locale === "fa" ? "Vazirmatn" : next);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    } finally {
      await page.goto("/admin/settings/theme");
      await heading.selectOption(initial);
      await page.locator('[name="lineOpacity"]').fill(initialOpacity);
      await page
        .getByRole("button", {
          name: copy[locale].themeEditor.save,
          exact: true,
        })
        .click();
      await expect(
        page.getByText(copy[locale].themeEditor.saved, { exact: true }),
      ).toBeVisible();
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
      { width: 1920, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/${locale}/m/CA`);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test
          .info()
          .outputPath(`moda4-foundation-${locale}-${viewport.width}.png`),
        fullPage: true,
        scale: "css",
      });
    }
    expect(fonts.length).toBeGreaterThan(0);
    expect(
      fonts.every(
        (url) =>
          new URL(url).origin ===
          new URL(test.info().project.use.baseURL!).origin,
      ),
    ).toBe(true);
    await page.goto("/admin/settings/theme");
    await expect(page.locator('select[name="fontPriceLatin"]')).toHaveValue(
      "Inter",
    );
    await expect(
      frame
        .locator(".moda-price")
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).resolves.toContain("Inter");
    if (locale !== "fa") {
      await expect(
        frame
          .getByRole("heading")
          .first()
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).resolves.toContain("Manrope");
      await expect
        .poll(
          async () =>
            await frame
              .locator("body")
              .evaluate(() =>
                document.fonts.check("500 24px Manrope", "ÇĞİıÖŞÜ"),
              ),
        )
        .toBe(true);
    }
    // Unsaved-warning hook is reused from the verified PR60 implementation.
    await page.locator('select[name="fontHeadingLatin"]').selectOption("Inter");
    const dialog = page.waitForEvent("dialog");
    const click = page.locator('a[href="/admin"]').first().click();
    await (await dialog).dismiss();
    await click;
    await expect(page).toHaveURL(/\/admin\/settings\/theme$/);
    await heading.selectOption(initial);
  });
}
