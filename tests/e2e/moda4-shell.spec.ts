import { useLegacyHomepage } from "./helpers/legacy-homepage";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { customerLogin } from "./helpers/crm-customer";
import { ensureMaintenanceOff } from "./helpers/maintenance";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

const db = new PrismaClient();
const copy = { fa, tr, en };
const fixtureId = `browser-r2-${randomUUID()}`;
const label = {
  fa: "آزمون منوی تازه",
  tr: "Yeni menü testi",
  en: "New menu proof",
};
let imageId: string;
let imageName: string;

test.beforeAll(async () => {
  if (
    !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
      "_test",
    )
  )
    throw new Error("Dedicated _test database required");
  const image = await db.media.findFirstOrThrow({
    where: {
      kind: "image",
      status: "READY",
      deletedAt: null,
      id: { startsWith: "seed-fashion-v2-" },
    },
  });
  imageId = image.id;
  imageName = image.originalName;
  await db.category.create({
    data: {
      id: fixtureId,
      titleI18n: label,
      slugI18n: { fa: fixtureId, tr: fixtureId, en: fixtureId },
      gender: "UNISEX",
      sortOrder: 999,
    },
  });
  await db.menuItem.create({
    data: {
      id: fixtureId,
      menuId: "seed-menu-header",
      labelI18n: label,
      linkType: "category",
      referenceId: fixtureId,
      enabled: true,
    },
  });
  await db.menuItem.create({
    data: {
      id: `${fixtureId}-child`,
      menuId: "seed-menu-header",
      parentId: fixtureId,
      labelI18n: label,
      linkType: "category",
      referenceId: fixtureId,
      enabled: true,
    },
  });
});
test.afterAll(async () => {
  await db.menuItem.updateMany({
    where: { id: { in: [fixtureId, `${fixtureId}-child`] } },
    data: { deletedAt: new Date() },
  });
  await db.category.updateMany({
    where: { id: fixtureId },
    data: { deletedAt: new Date() },
  });
  await db.$disconnect();
});
test.describe.configure({ mode: "serial" });

test("menu READY image: real admin draft framing, save/reload and live storefront", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await ensureMaintenanceOff(page.request);
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
      value: "en",
      url: test.info().project.use.baseURL!,
    },
  ]);
  await page.goto("/admin/content/menus");
  const form = page
    .locator("form")
    .filter({ has: page.locator(`input[name=id][value="${fixtureId}"]`) });
  await form.getByRole("button", { name: en.media.chooseMedia }).click();
  const picker = form.locator("dialog");
  await picker.locator("input[type=search]").fill(imageName);
  await picker.getByTestId(`media-picker-item-${imageId}`).click();
  await expect(form.locator("[name=mediaId]")).toHaveValue(imageId);
  await form.locator("[name=imageFit]").selectOption("cover");
  await form.locator("[name=focalX]").fill("0.25");
  await form.locator("[name=focalY]").fill("0.75");
  await form.locator("[name=imageTone]").selectOption("kidsMint");
  const preview = form.getByTestId("menu-presentation-preview");
  await expect(preview.locator("img")).toHaveCSS("object-position", "25% 75%");
  await form
    .getByRole("button", { name: en.contentAdmin.desktopPreview })
    .click();
  await expect(preview).toHaveCSS("aspect-ratio", "3 / 2");
  await form
    .getByRole("button", { name: en.contentAdmin.saveItem, exact: true })
    .click();
  await expect(form.getByRole("status")).toBeVisible();
  await page.reload();
  await expect(form.locator("[name=mediaId]")).toHaveValue(imageId);
  await expect(form.locator("[name=focalX]")).toHaveValue("0.25");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/m/CA");
  const nav = page.locator(".moda-desktop-navigation");
  const toggle = nav.getByRole("button", {
    name: en.contentNavigation.openMenu.replace("{label}", label.en),
    exact: true,
  });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(nav.locator(".moda-menu-tile img")).toHaveCSS(
    "object-position",
    "25% 75%",
  );
  await expect(nav.locator(".moda-menu-tile img")).toHaveCSS(
    "object-fit",
    "cover",
  );
  await page.screenshot({
    path: test.info().outputPath("menu-desktop-1440.png"),
    scale: "css",
  });
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await nav.getByRole("link", { name: label.en, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(label.en);
});

for (const [locale, marketCode] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`${locale}: touch/keyboard navigation, real search, current cart quote and verified newsletter consent`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(150000);
    const t = copy[locale];
    await ensureMaintenanceOff(page.request);
    await context.addCookies([
      { name: "market", value: marketCode, url: info.project.use.baseURL! },
    ]);
    await page.goto(`/${locale}/m/${marketCode}`);
    const newsletter = page.locator(".moda-newsletter");
    await expect(
      newsletter.getByRole("link", { name: t.footer.newsletterManage }),
    ).toBeVisible();
    await expect(newsletter.locator("select")).toHaveCount(0);
    for (const width of [390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          page
            .locator(".moda-brand img")
            .evaluate((el) => (el as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`shell-${locale}-${width}.png`),
        scale: "css",
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.locator(".storefront-mobile-menu");
    await menu.locator("summary").click();
    const allCategories = menu.getByRole("button", {
      name: t.contentNavigation.openMenu.replace(
        "{label}",
        t.shopping.browseCategories,
      ),
      exact: true,
    });
    if (await allCategories.isVisible()) await allCategories.click();
    await expect(
      menu.getByRole("link", { name: label[locale], exact: true }).first(),
    ).toBeVisible();
    // The extra category remains discoverable alongside all seeded departments.
    const roots = await db.category.findMany({
      where: { parentId: null, deletedAt: null },
    });
    expect(roots.length).toBeGreaterThan(4);
    for (const root of roots) {
      const rootSlug = (root.slugI18n as Record<string, string>)[locale];
      if (rootSlug)
        await expect(
          menu
            .locator(
              `a[href="/${locale}/m/${marketCode}/c/${encodeURIComponent(rootSlug)}"]`,
            )
            .first(),
        ).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    const search = page
      .locator("header")
      .getByRole("button", { name: t.catalog.search, exact: true });
    await search.click();
    const dialog = page.locator(".moda-search-dialog");
    await expect(dialog.locator("input[type=search]")).toBeFocused();
    const product = await db.product.findUniqueOrThrow({
      where: { id: "seed-style-v2-women-coat" },
    });
    await dialog
      .locator("input[type=search]")
      .fill((product.titleI18n as Record<string, string>)[locale]);
    await expect(dialog.getByRole("link").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toHaveAttribute("open", "");
    await expect(search).toBeFocused();
    await search.click();
    const searchedSlug = (product.slugI18n as Record<string, string>)[locale];
    await dialog
      .locator(
        `a[href="/${locale}/m/${marketCode}/p/${encodeURIComponent(searchedSlug)}"]`,
      )
      .click();
    await expect(page.locator(".shop-product-title")).toBeVisible();
    await expect(dialog).not.toHaveAttribute("open", "");
    const target = locale === "en" ? "tr" : "en";
    const translated = page
      .locator(".moda-announcement .storefront-languages a")
      .filter({ hasText: target.toUpperCase() });
    const slug = (product.slugI18n as Record<string, string>)[target];
    const marketLocales = (
      await db.market.findUniqueOrThrow({ where: { code: marketCode } })
    ).enabledLocales;
    if (marketLocales.includes(target)) {
      await expect(translated).toHaveAttribute(
        "href",
        `/${target}/m/${marketCode}/p/${encodeURIComponent(slug)}`,
      );
      await translated.click();
      await expect(page.locator(".shop-product-title")).toContainText(
        (product.titleI18n as Record<string, string>)[target],
      );
    } else {
      await expect(translated).toHaveCount(0);
      const unavailable = await page.request.get(
        `/api/catalog/localized-path?${new URLSearchParams({ pathname: new URL(page.url()).pathname, target })}`,
      );
      expect(await unavailable.json()).toEqual({ href: null });
    }
    await page.goto(`/${locale}/m/${marketCode}`);
    await search.click();
    await dialog
      .locator("input[type=search]")
      .fill((product.titleI18n as Record<string, string>)[locale]);
    await dialog
      .getByRole("button", { name: t.catalog.search, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/search\\?q=`));
    await expect(page.locator(".shop-product-card").first()).toBeVisible();
    await page.goto(`/${locale}/m/${marketCode}`);
    const studio = page.getByTestId("shop-look-studio").first();
    await studio.locator(".look-item input[type=checkbox]").nth(3).uncheck();
    for (let i = 0; i < 3; i++)
      await studio
        .locator("select:enabled")
        .nth(i)
        .selectOption({ label: "M" });
    const subtotal = await studio.locator(".look-total strong").innerText();
    await studio.locator(".look-add").click();
    await expect(studio.locator(".look-add")).toContainText(t.outfit.inBag);
    await page.locator(".storefront-cart-toggle").click();
    const cart = page.locator(".moda-cart-drawer");
    await expect(cart.locator(".moda-drawer-item")).toHaveCount(3);
    await expect(cart.locator(".moda-drawer-item").first()).toContainText("M");
    await expect(cart.locator(".moda-drawer-total").first()).toContainText(
      subtotal,
    );
    await expect(
      cart.getByText(t.commerce.quoteUnavailable, { exact: true }),
    ).toHaveCount(0);
    await cart.getByRole("link", { name: t.commerce.viewCart }).click();
    await expect(page.locator(".shop-cart-item")).toHaveCount(3);
    const otherMarket = marketCode === "CA" ? "TR" : "CA";
    await page.goto(`/${locale}/m/${otherMarket}`);
    await page.locator(".storefront-cart-toggle").click();
    await expect(
      cart.getByText(t.commerce.marketWarning, { exact: true }),
    ).toBeVisible();
    await page.goto(`/${locale}/m/${marketCode}`);
    const email = `r2-newsletter-${randomUUID()}@example.com`;
    await customerLogin(page, email, locale);
    await page.goto(`/${locale}/m/${marketCode}`);
    await expect(newsletter.locator("select[name=status]")).toHaveValue(
      "OPTED_OUT",
    );
    await newsletter.locator("select[name=status]").selectOption("OPTED_IN");
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      newsletter.getByRole("button", { name: t.crm.save, exact: true }).click(),
    ]);
    await expect(newsletter.locator("select[name=status]")).toHaveValue(
      "OPTED_IN",
    );
    const customer = await db.customer.findUniqueOrThrow({ where: { email } });
    const market = await db.market.findUniqueOrThrow({
      where: { code: marketCode },
    });
    await expect
      .poll(
        async () =>
          (
            await db.marketingConsent.findUniqueOrThrow({
              where: {
                customerId_marketId_channel: {
                  customerId: customer.id,
                  marketId: market.id,
                  channel: "email",
                },
              },
            })
          ).status,
      )
      .toBe("OPTED_IN");
    expect(
      await db.marketingConsent.count({
        where: { customerId: customer.id, marketId: { not: market.id } },
      }),
    ).toBe(0);
    await newsletter.locator("select[name=status]").selectOption("OPTED_OUT");
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      newsletter.getByRole("button", { name: t.crm.save, exact: true }).click(),
    ]);
    await expect(newsletter.locator("select[name=status]")).toHaveValue(
      "OPTED_OUT",
    );
  });
}

useLegacyHomepage();
