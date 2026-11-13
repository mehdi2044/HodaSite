import { expect, test, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

const copy = { fa, tr, en };

const locales = ["fa", "tr", "en"] as const;
const markets = ["IR", "TR", "CA"] as const;
const configuredLocales: Record<
  (typeof markets)[number],
  readonly (typeof locales)[number][]
> = {
  IR: ["fa"],
  TR: ["tr", "en"],
  CA: ["en", "fa", "tr"],
};

for (const requestedLocale of locales) {
  for (const market of markets) {
    test(`${requestedLocale}/${market} preserves the market and respects enabled languages`, async ({
      page,
    }) => {
      const enabled = configuredLocales[market];
      const locale = enabled.includes(requestedLocale)
        ? requestedLocale
        : enabled[0];
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/${requestedLocale}/fitting-room?market=${market}`);
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
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === `/${locale}/fitting-room` &&
          url.searchParams.get("market") === market,
      );
      await expect(select).toHaveValue(market);
      const dock = page.getByTestId("mobile-bottom-navigation");
      // Next can retain the previous locale tree while the visible dock swaps.
      const loginLink = dock.getByRole("link", {
        name: copy[locale].instantFitting.dockLogin,
        exact: true,
      });
      await expect(loginLink).toHaveCount(1);
      const loginHref = await loginLink.getAttribute("href");
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
  await centerIsExposed(target);
}

async function centerIsExposed(target: Locator) {
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

test("explicit market and language switches on login keep the fitting return usable", async ({
  page,
}) => {
  await page.goto("/fa/fitting-room?market=CA");
  await page
    .getByTestId("mobile-bottom-navigation")
    .locator('a[href*="account/login"]')
    .click();
  await expect(page).toHaveURL(/\/fa\/account\/login\?/);
  const english = page.locator(
    '.moda-context-controls a[aria-label="English"]',
  );
  await expect(english).toHaveAttribute(
    "href",
    /\/en\/account\/login\?market=CA/,
  );
  await english.click();
  await expect(page).toHaveURL(/\/en\/account\/login\?market=CA/);
  await page.locator(".moda-context-controls select").selectOption("TR");
  await expect(page).toHaveURL(/\/en\/account\/login\?market=TR/);
  const turkish = page.locator('.moda-context-controls a[aria-label="Türkçe"]');
  await turkish.click();
  await expect(page).toHaveURL(/\/tr\/account\/login\?market=TR/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(
    "/tr/fitting-room?market=TR",
  );
});

test("short mobile fitting controls and footer can be reached beside the dock", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 630 });
  await page.goto("/fa/fitting-room?market=CA");
  const dock = page.getByTestId("mobile-bottom-navigation");
  const login = dock.locator('a[href*="account/login"]');
  await dock.locator("a").first().focus();
  await expect(dock.locator("a").first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dock.locator("a").nth(1)).toBeFocused();
  expect((await login.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await reachesCenter(page.locator(".moda-instant-stage"));
  await reachesCenter(page.locator(".moda-footer-links nav a").last());
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("short mobile product keeps its price and purchase button separately visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 630 });
  await page.goto("/fa/m/CA/p/" + encodeURIComponent("محصول-1"));
  const bar = page.locator(".shop-product-submit");
  const buy = bar.locator(".shop-add-button");
  const price = bar.locator(".moda-mobile-buy-price bdi");
  await expect(bar).toHaveCSS("position", "static");
  await expect(buy).toHaveCSS("position", "relative");
  await expect(price).toContainText(/CA\$|CAD/);
  await reachesCenter(buy);
  await centerIsExposed(price);
  const purchaseBounds = (await bar.boundingBox())!;
  const buttonBounds = (await buy.boundingBox())!;
  expect(buttonBounds.y).toBeGreaterThanOrEqual(purchaseBounds.y);
  expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(
    purchaseBounds.y + purchaseBounds.height,
  );
  await expect(buy).toBeEnabled();
  const variant = await bar.locator('input[name="variantId"]').inputValue();
  expect(variant).not.toBe("");
  await buy.tap();
  await expect(
    bar.getByRole("status").filter({ hasText: fa.commerce.saved }),
  ).toBeVisible();
  await page.locator(".storefront-cart-toggle").click();
  await expect(page.locator(".moda-cart-drawer")).toBeVisible();
  await expect(
    page
      .locator(".moda-cart-drawer article")
      .filter({
        has: page.locator(`input[name="variantId"][value="${variant}"]`),
      }),
  ).toHaveCount(1);
});

test("customer OTP returns from Persian sign-in to the Canadian fitting room", async ({
  page,
}) => {
  const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
  const email = `moda4-${randomUUID()}@example.com`;
  await page.goto("/fa/fitting-room?market=CA");
  await page
    .getByTestId("mobile-bottom-navigation")
    .locator('a[href*="account/login"]')
    .click();
  const input = page.locator('main input[name="email"]');
  await input.fill(email);
  await input
    .locator("xpath=ancestor::form")
    .locator('button:not([type="button"])')
    .last()
    .click();
  const otp = page.getByTestId("otp-code");
  await expect(otp).toBeVisible();
  let code = "";
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
          },
        });
        const query = new URLSearchParams({ query: `to:${email}` });
        const response = await page.request.get(
          `${mailpit}/api/v1/search?${query}`,
        );
        const messages = (await response.json()) as {
          messages?: { ID: string }[];
        };
        const message = messages.messages?.[0];
        if (!message) return false;
        const mail = (await (
          await page.request.get(`${mailpit}/api/v1/message/${message.ID}`)
        ).json()) as { Text: string };
        code = mail.Text.match(/\b\d{6}\b/)?.[0] ?? "";
        return code.length === 6;
      },
      { timeout: 45000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  await otp.fill(code);
  await page
    .getByRole("button", { name: fa.commerce.login, exact: true })
    .click();
  await expect(page).toHaveURL(/\/fa\/fitting-room\?market=CA$/);
  await expect(page.locator(".moda-context-controls select")).toHaveValue("CA");
});

test.describe("short desktop Hero", () => {
  test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("all four Hero images keep the top edge and buy controls reachable at short desktop sizes", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1267, height: 630 });
    await page.goto("/fa/m/IR");
    const hero = page.locator('[data-moda4="hero"]').first();
    const tabs = hero.locator('[data-moda4="hero-progress"] > button');
    await expect(tabs).toHaveCount(4);
    for (const [width, height] of [
      [1267, 540],
      [1267, 630],
      [1280, 630],
      [1440, 630],
    ]) {
      await page.setViewportSize({ width, height });
      for (let index = 0; index < 4; index++) {
        await page.evaluate(() => scrollTo(0, 0));
        await tabs.nth(index).click();
        expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
        const slide = hero.locator('[data-moda4="hero-slide"]:visible');
        await expect(slide).toHaveAttribute("data-mode", /[CD]/);
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
        for (const button of await slide
          .locator(".m4-acts a, .m4-acts button")
          .all()) {
          await centerIsExposed(button);
        }
        for (const pin of await slide
          .locator(".m4-pin .m4-dot:visible")
          .all()) {
          expect(
            await pin.evaluate((el) => {
              const box = el.getBoundingClientRect();
              const hit = document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              );
              return hit?.closest(".m4-pin") === el.closest(".m4-pin");
            }),
          ).toBe(true);
        }
        for (const price of await slide
          .locator(".m4-strip:visible button")
          .all()) {
          await centerIsExposed(price);
        }
        const acts = await slide.locator(".m4-acts").boundingBox();
        const controls = await hero
          .locator(".moda-carousel-controls")
          .boundingBox();
        expect(acts!.y + acts!.height).toBeLessThanOrEqual(controls!.y);
      }
    }
  });
});
