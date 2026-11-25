import { expect, test } from "@playwright/test";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

const markets = [
  { locale: "fa", market: "IR", product: "محصول-1", copy: fa },
  { locale: "tr", market: "TR", product: "urun-1", copy: tr },
  { locale: "en", market: "CA", product: "product-1", copy: en },
] as const;

test("the cart button becomes usable after the storefront layout hydrates", async ({
  page,
}) => {
  let releaseLayout!: () => void;
  const pendingLayout = new Promise<void>((resolve) => {
    releaseLayout = resolve;
  });
  await page.route(
    /\/_next\/static\/chunks\/app\/(?:%5Blocale%5D|\[locale\])\/layout(?:-[^/]+)?\.js(?:\?.*)?$/i,
    async (route) => {
      await pendingLayout;
      await route.continue();
    },
  );
  try {
    await page.goto("/tr/account/login?market=CA", { waitUntil: "commit" });
    const toggle = page.locator(".storefront-cart-toggle");
    await expect(toggle).toBeDisabled();
  } finally {
    releaseLayout();
  }
  await page.locator(".storefront-cart-toggle").click();
  await expect(
    page.locator('dialog[open] a[href="/tr/cart?market=CA"]'),
  ).toBeVisible();
});

for (const { locale, market, product, copy } of markets) {
  test(`${locale} purchase preserves server markup across document hydration`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || /hydrat/i.test(message.text()))
        errors.push(message.text());
    });
    await page.addInitScript(() => {
      // Keep the first parsed wrapper to detect a client-side recovery that
      // replaces the server tree even if the page is usable afterwards.
      const observer = new MutationObserver(() => {
        const content = document.getElementById("storefront-content");
        if (!content) return;
        (window as Window & { m1ServerContent?: Element }).m1ServerContent =
          content;
        observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const productPage = `/${locale}/m/${market}/p/${encodeURIComponent(product)}`;
    await page.goto(productPage);
    await page.locator(".shop-add-button").click();
    await expect(
      page.getByRole("status").filter({ hasText: copy.commerce.saved }).first(),
    ).toBeVisible();

    const cart = `/${locale}/cart?market=${market}`;
    for (let visit = 0; visit < 3; visit++) {
      await page.goto(cart);
      const quantity = page.locator(
        'main input[type="number"][name="quantity"]',
      );
      await expect(quantity).toHaveValue("1");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("#storefront-content > main")).toHaveCount(1);
      await page.locator(".storefront-cart-toggle").click();
      await expect(page.locator("dialog.moda-cart-drawer")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            (window as Window & { m1ServerContent?: Element })
              .m1ServerContent ===
            document.getElementById("storefront-content"),
        ),
      ).toBe(true);
    }
    for (let visit = 0; visit < 2; visit++) {
      await page.goto(`/${locale}/checkout?market=${market}`);
      await expect(page.locator('main input[name="firstName"]')).toBeVisible();
      await expect(
        page.locator('[data-testid="mobile-bottom-navigation"]'),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  for (const width of [390, 768, 1440]) {
    test(`${locale} footer keeps navigation and policy links usable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/m/${market}`);
      const footer = page.locator('[data-moda4="footer"]');
      const top = footer.locator(".moda-footer-top");
      const links = footer.locator(".moda-footer-links");
      const groups = footer.locator(".moda-footer-groups > li");
      await expect(groups).toHaveCount(4);
      await expect(
        groups.first().locator(`a[href^="/${locale}/m/${market}/c/"]`),
      ).toHaveCount(4);
      await expect(
        footer.locator(`nav a[href^="/${locale}/m/${market}/pages/"]`),
      ).toHaveCount(8);
      await expect(footer.locator(".moda-footer-wordmark")).toBeVisible();
      await expect(footer).toHaveCSS(
        "direction",
        locale === "fa" ? "rtl" : "ltr",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const newsletterBounds = (await top.boundingBox())!;
      const navBounds = (await links.boundingBox())!;
      if (width <= 768) {
        expect(newsletterBounds.y + newsletterBounds.height).toBeLessThan(
          navBounds.y,
        );
      } else {
        expect(Math.abs(newsletterBounds.y - navBounds.y)).toBeLessThan(2);
      }
      const lastPolicy = footer.locator(".moda-footer-directory a").last();
      await expect(async () => {
        await lastPolicy.focus();
        await expect(lastPolicy).toBeFocused({ timeout: 500 });
      }).toPass({ timeout: 5000 });
      const href = await lastPolicy.getAttribute("href");
      expect((await page.request.get(href!)).ok()).toBe(true);
    });
  }
}
