import { expect, test, type Locator } from "@playwright/test";

const locales = ["fa", "tr", "en"] as const;
const markets = ["IR", "TR", "CA"] as const;

for (const locale of locales) {
  for (const market of markets) {
    test(`${locale}/${market} header, profile, cart and fitting preserve the explicit context`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/${locale}/fitting-room?market=${market}`);
      const header = page.locator(".moda-header");
      const select = page.locator(".moda-context-controls select");
      await expect(select).toHaveValue(market);
      await expect(page.locator(".storefront-app")).toHaveAttribute(
        "lang",
        locale,
      );
      const fitting = header
        .locator('.moda-desktop-navigation a[href*="fitting-room"]')
        .first();
      await expect(fitting).toHaveAttribute(
        "href",
        `/${locale}/fitting-room?market=${market}`,
      );
      await fitting.click();
      await expect(select).toHaveValue(market);
      const dock = page.getByTestId("mobile-bottom-navigation");
      const loginHref = await dock
        .locator('a[href*="account/login"]')
        .getAttribute("href");
      const login = new URL(loginHref!, page.url());
      expect(login.searchParams.get("market")).toBe(market);
      expect(login.searchParams.get("next")).toBe(
        `/${locale}/fitting-room?market=${market}`,
      );
      await header.locator(".moda-account-tool").click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/account/login\\?market=${market}$`),
      );
      await expect(select).toHaveValue(market);
      await header.locator(".storefront-cart-toggle").click();
      await page
        .locator(`dialog[open] a[href="/${locale}/cart?market=${market}"]`)
        .click();
      await expect(select).toHaveValue(market);
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/cart\\?market=${market}$`),
      );
      await dock.locator(`a[href="/${locale}/m/${market}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}$`));
    });
  }
}

async function reachesCenter(target: Locator) {
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          ),
        );
      }),
    )
    .toBe(true);
}

test("short mobile fitting controls and footer can be reached beside the dock", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 630 });
  await page.goto("/fa/fitting-room?market=CA");
  const dock = page.getByTestId("mobile-bottom-navigation");
  const login = dock.locator('a[href*="account/login"]');
  await dock.locator("a").first().focus();
  await expect(dock.locator("a").first()).toBeFocused();
  expect((await login.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await reachesCenter(page.locator(".moda-instant-stage"));
  await reachesCenter(page.locator(".moda-footer-links nav a").last());
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("all four Hero images keep the top edge and buy controls reachable at short desktop sizes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1267, height: 630 });
  await page.goto("/fa/m/IR");
  const hero = page.locator('[data-moda4="hero"]').first();
  const tabs = hero.locator('[data-moda4="hero-progress"] > button');
  await expect(tabs).toHaveCount(4);
  for (const width of [1267, 1280, 1440]) {
    await page.setViewportSize({ width, height: 630 });
    for (let index = 0; index < 4; index++) {
      await tabs.nth(index).click();
      await page.evaluate(() => scrollTo(0, 0));
      const slide = hero.locator('[data-moda4="hero-slide"]:visible');
      const image = slide.locator(".m4-media:visible img");
      await expect(image).toBeVisible();
      const frame = await image.evaluate(async (el: HTMLImageElement) => {
        await el.decode();
        const style = getComputedStyle(el);
        return {
          image: el.getBoundingClientRect().top,
          header: document
            .querySelector(".moda-header")!
            .getBoundingClientRect().bottom,
          position: style.objectPosition,
          fit: style.objectFit,
        };
      });
      expect(frame.image).toBeGreaterThanOrEqual(frame.header - 1);
      expect(frame.position).toMatch(/ 0%$/);
      expect(frame.fit).toBe("cover");
      await reachesCenter(slide.locator(".m4-acts a, .m4-acts button").first());
    }
  }
});
