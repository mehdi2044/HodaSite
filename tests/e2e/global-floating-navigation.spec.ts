import { expect, test } from "@playwright/test";
import { fillAdminMfa } from "./helpers/admin-mfa";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";

const markets = [
  ["fa", "IR", fa],
  ["tr", "TR", tr],
  ["en", "CA", en],
] as const;
test.use({ hasTouch: true });
for (const [locale, market, copy] of markets) {
  for (const width of [360, 390, 430, 768, 1440]) {
    test(`shared dock ${locale} ${width}: direct home and real public routes`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: width >= 768 ? 1050 : 844 });
      const home = `/${locale}/m/${market}`;
      await page.goto(home);
      await page.evaluate(() => document.fonts.ready);
      const dock = page.getByTestId("mobile-bottom-navigation");
      await expect(dock).toBeVisible();
      await expect(dock.getByRole("link")).toHaveCount(6);
      await expect(page.locator(".storefront-app")).toHaveAttribute(
        "dir",
        locale === "fa" ? "rtl" : "ltr",
      );
      const metrics = await dock.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          color: getComputedStyle(el).backgroundColor,
          bottom: innerHeight - rect.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
          links: [...el.querySelectorAll("a")].map((a) => {
            const r = a.getBoundingClientRect(),
              text = document.createRange();
            text.selectNodeContents(a);
            return {
              width: r.width,
              height: r.height,
              href: a.getAttribute("href"),
              readable: [...text.getClientRects()].every(
                (t) =>
                  t.left >= r.left - 1 &&
                  t.right <= r.right + 1 &&
                  t.top >= r.top - 1 &&
                  t.bottom <= r.bottom + 1,
              ),
            };
          }),
        };
      });
      expect(metrics.overflow).toBe(false);
      expect(metrics.color).toMatch(/(?:20, 18, 16|23, 21, 18)/);
      expect(metrics.bottom).toBeGreaterThanOrEqual(8);
      for (const link of metrics.links) {
        expect(link.width).toBeGreaterThanOrEqual(44);
        expect(link.height).toBeGreaterThanOrEqual(44);
        expect(link.readable).toBe(true);
        expect(link.href).not.toMatch(/fittingNav|^#|undefined/);
      }
      await expect(dock.getByRole("link").nth(0)).toHaveAttribute(
        "aria-current",
        "page",
      );
      await page.screenshot({
        path: info.outputPath(`home-${locale}-${width}.png`),
      });
      await dock.getByRole("link").nth(1).click();
      await expect(page).toHaveURL(/\/c\//);
      await expect(dock.getByRole("link").nth(1)).toHaveAttribute(
        "aria-current",
        "page",
      );
      await dock.getByRole("link").nth(0).click();
      const catalog = dock.getByRole("link", {
        name: copy.instantFitting.dockProduct,
        exact: true,
      });
      await expect(catalog).toHaveAttribute(
        "href",
        `/${locale}/search?market=${market}`,
      );
      await catalog.tap();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/search\\?market=${market}`),
      );
      await expect(dock).toBeVisible();
      const firstProduct = page.locator(".shop-product-link").first();
      await expect(firstProduct).toBeVisible();
      await firstProduct.click();
      await expect(page).toHaveURL(/\/p\//);
      const pdpPath = new URL(page.url()).pathname;
      await expect(catalog).toHaveAttribute("href", new RegExp(pdpPath));
      const productHref = await catalog.getAttribute("href");
      expect(productHref).toContain(`/m/${market}/p/`);
      await expect(page.locator(".storefront-cart-toggle")).toBeVisible();
      const buy = page.locator(".shop-product-submit .shop-add-button");
      await buy.scrollIntoViewIfNeeded();
      const purchaseBox = await buy.boundingBox();
      const dockBox = await dock.boundingBox();
      expect(purchaseBox).not.toBeNull();
      expect(dockBox).not.toBeNull();
      expect(purchaseBox!.y + purchaseBox!.height).toBeLessThanOrEqual(
        dockBox!.y,
      );
      await catalog.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(catalog).toBeFocused();
      expect(
        await catalog.evaluate((el) => getComputedStyle(el).outlineStyle),
      ).not.toBe("none");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === pdpPath &&
          url.searchParams.get("color") ===
            new URL(productHref!, page.url()).searchParams.get("color"),
      );
      await dock.getByRole("link").nth(0).click();
      await expect(page).toHaveURL(new RegExp(home + "$"));
      await expect(catalog).toHaveAttribute(
        "href",
        `/${locale}/search?market=${market}`,
      );
      await page.goto(`/${locale}/cart?market=${market}`);
      await expect(dock).toBeVisible();
      await page.locator(".storefront-cart-toggle").click();
      await expect(page.locator("dialog.moda-cart-drawer")).toBeVisible();
      await expect(dock).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(dock).toBeVisible();
    });
  }
  test(`shared dock ${locale}: fitting selection and account links remain valid`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/fitting-room?market=${market}`);
    const dock = page.getByTestId("mobile-bottom-navigation");
    await expect(dock.getByRole("link")).toHaveCount(7);
    const product = dock.getByRole("link", {
      name: copy.instantFitting.dockProduct,
      exact: true,
    });
    await expect(product).toHaveAttribute("href", /#instant-gallery$/);
    for (const [key, path] of [
      ["dockLogin", "account/login"],
      ["dockProfile", "account"],
    ] as const)
      await expect(
        dock.getByRole("link", { name: copy.instantFitting[key], exact: true }),
      ).toHaveAttribute("href", `/${locale}/${path}?market=${market}`);
    await dock
      .getByRole("link", { name: copy.instantFitting.dockLogin, exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) => url.pathname === `/${locale}/account/login`,
    );
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await dock
      .getByRole("link", { name: copy.instantFitting.dockProfile, exact: true })
      .click();
    await expect(page).toHaveURL((url) =>
      url.pathname.startsWith(`/${locale}/account`),
    );
    await dock
      .getByRole("link", { name: copy.instantFitting.dockFitting, exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) => url.pathname === `/${locale}/fitting-room`,
    );
    await page.goto(`/${locale}/m/${market}/p/definitely-not-a-product`);
    await expect(product).toHaveAttribute(
      "href",
      `/${locale}/search?market=${market}`,
    );
  });
}
test("admin can disable and restore the shared dock through authorized theme settings", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page
    .getByLabel("Ø§ÛŒÙ…ÛŒÙ„")
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .getByLabel("Ø±Ù…Ø² Ø¹Ø¨ÙˆØ±")
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ÙˆØ±ÙˆØ¯ Ø§Ù…Ù†" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("mobile-bottom-navigation")).toHaveCount(0);
  await page.goto("/admin/settings/theme");
  const toggle = page.getByRole("checkbox", {
    name: fa.themeEditor.floatingNavigation,
    exact: true,
  });
  await expect(toggle).toBeChecked();
  try {
    await toggle.uncheck();
    await page.getByRole("button", { name: "Ø°Ø®ÛŒØ±Ù‡", exact: true }).click();
    await expect(page.locator("p[role=status]")).toBeVisible();
    await page.goto("/fa/m/IR");
    await expect(page.getByTestId("mobile-bottom-navigation")).toHaveCount(0);
    await expect(page.locator(".storefront-cart-toggle")).toBeVisible();
  } finally {
    await page.goto("/admin/settings/theme");
    await toggle.check();
    await page.getByRole("button", { name: "Ø°Ø®ÛŒØ±Ù‡", exact: true }).click();
    await expect(page.locator("p[role=status]")).toBeVisible();
  }
  await page.goto("/fa/m/IR");
  await expect(page.getByTestId("mobile-bottom-navigation")).toBeVisible();
});

test("desktop dock preserves the original Hero frame and excludes all visible purchase/control targets", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [locale, market] of markets) {
    for (const [width, height] of [
      [1440, 900],
      [1440, 1050],
      [1024, 768],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/${locale}/m/${market}`);
      const hero = page.locator("[data-moda4=hero]");
      const dock = page.getByTestId("mobile-bottom-navigation");
      const expected =
        Math.max(600, width / 2, Math.min(height * 0.92, 940)) - 72;
      expect((await hero.boundingBox())!.height).toBeCloseTo(expected, 0);
      const tabs = hero.locator(".moda-carousel-tabs > button");
      for (let slide = 0; slide < 4; slide++) {
        await tabs.nth(slide).click();
        await page.evaluate(() => scrollTo(0, 0));
        await expect(
          hero.locator('[data-moda4="hero-slide"]:visible'),
        ).toHaveAttribute("data-slide", String(slide));
        const snapshot = await hero
          .locator(
            '[data-moda4="hero-slide"]:visible button:visible, .moda-carousel-controls button:visible, [data-moda4="hero-slide"]:visible a:visible',
          )
          .evaluateAll((nodes) => {
            const n = document
              .querySelector('[data-testid="mobile-bottom-navigation"]')!
              .getBoundingClientRect();
            const overlapping = nodes
              .filter((node) => {
                const t = node.getBoundingClientRect();
                return (
                  t.left < n.right &&
                  t.right > n.left &&
                  t.top < n.bottom &&
                  t.bottom > n.top
                );
              })
              .map((node) => ({
                text: node.textContent,
                className: node.className,
              }));
            return { count: nodes.length, overlapping };
          });
        expect(snapshot.count).toBeGreaterThanOrEqual(7);
        expect(snapshot.overlapping).toEqual([]);
      }
    }
  }
});
