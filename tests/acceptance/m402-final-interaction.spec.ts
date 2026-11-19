import { expect, test, type Locator, type Page } from "@playwright/test";

const contexts = [
  { locale: "fa", market: "IR", journal: "مجله مد و استایل" },
  { locale: "tr", market: "TR", journal: "Moda ve Stil Dergisi" },
  { locale: "en", market: "CA", journal: "Style Journal" },
] as const;

async function hit(control: Locator) {
  await control.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await control.click();
}
function errorsOn(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

for (const { locale, market, journal } of contexts) {
  const home = `/${locale}/m/${market}`;
  const magazine = home + "/magazine";
  for (const width of [320, 390, 768, 1024, 1440]) {
    test(`${locale} journal header and hamburger at ${width}`, async ({
      page,
    }, info) => {
      const errors = errorsOn(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(home);
      await expect(page.locator(".storefront-cart-toggle")).toBeEnabled();
      const header = page.locator('[data-moda4="header"]');
      const logo = header.locator('[data-moda4="logo"]');
      const initialLogo = await logo.boundingBox();
      expect(initialLogo).not.toBeNull();
      let link: Locator;
      if (width <= 1100) {
        const menu = header.locator(".storefront-mobile-menu");
        const toggle = menu.locator("summary.storefront-menu-toggle");
        await toggle.click();
        link = menu.getByRole("link", { name: journal, exact: true });
        await expect(link).toBeVisible();
        await link.focus();
        await page.keyboard.press("Escape");
        await expect(toggle).toBeFocused();
        await expect(menu).not.toHaveAttribute("open");
        await toggle.click();
        await page.screenshot({
          path: info.outputPath(`hamburger-${locale}-${width}.png`),
          fullPage: true,
        });
      } else {
        link = header
          .locator(".moda-desktop-navigation")
          .getByRole("link", { name: journal, exact: true });
        await expect(link).toBeVisible();
        const bounds = await header.evaluate((el) => {
          const logo = el.querySelector(".moda-brand")!.getBoundingClientRect();
          return [
            ...el.querySelectorAll(
              ".moda-desktop-navigation .moda-menu-root > a",
            ),
          ].map((a) => {
            const b = a.getBoundingClientRect();
            const p = a
              .closest(".moda-desktop-navigation")!
              .getBoundingClientRect();
            return {
              inNavigation: b.left >= p.left - 1 && b.right <= p.right + 1,
              overlapsLogo:
                Math.min(b.right, logo.right) > Math.max(b.left, logo.left) &&
                Math.min(b.bottom, logo.bottom) > Math.max(b.top, logo.top),
            };
          });
        });
        expect(bounds.every((b) => b.inNavigation && !b.overlapsLogo)).toBe(
          true,
        );
        await header.screenshot({
          path: info.outputPath(`header-${locale}-${width}.png`),
        });
      }
      await expect(link).toHaveAttribute("href", magazine);
      await hit(link);
      await expect(page).toHaveURL(new RegExp(magazine + "$"));
      await expect(page.locator(".magazine-page h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "fa" ? "rtl" : "ltr",
      );
      await expect(
        header.locator(`a[href="${magazine}"][aria-current="page"]`).first(),
      ).toHaveAttribute("title", journal);
      if (width <= 1100)
        await expect(
          header.locator(".storefront-mobile-menu"),
        ).not.toHaveAttribute("open");
      if (width < 1024) {
        await expect(
          page.locator(
            ".storefront-dock-compact > a, .storefront-dock-compact > details",
          ),
        ).toHaveCount(5);
      }
      expect(
        (await page.context().cookies()).find((c) => c.name === "market")
          ?.value,
      ).toBe(market);
      await page.reload();
      await expect(page.locator(".magazine-page h1")).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`magazine-${locale}-${width}.png`),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
  }

  test(`${locale} loading controls never advertise an unhandled click`, async ({
    page,
  }, info) => {
    const errors = errorsOn(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      /\/_next\/static\/chunks\/.*\.js(?:\?|$)/,
      async (route) => {
        await gate;
        await route.continue();
      },
    );
    const ad = page.locator('[data-moda4="fitting-ad"]');
    try {
      const response = await page.goto(home, { waitUntil: "commit" });
      await expect(ad.locator("[data-m4-look]")).toHaveCount(4);
      await response?.finished();
      for (const control of await ad.locator(".m4-chip").all())
        await expect(control).toBeDisabled();
      await expect(ad.locator(".m4-fit-loading")).toBeVisible();
      await expect(ad.locator(".m4-fit-sets")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      const chip = ad.locator("[data-m4-look]").nth(1);
      await chip.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const box = (await chip.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(chip).toHaveAttribute("aria-pressed", "false");
      await page.screenshot({
        path: info.outputPath("early-loading.png"),
        fullPage: true,
      });
    } finally {
      release();
    }
    await expect(ad).toHaveAttribute("data-interactive", "true");
    await expect(ad.locator(".m4-fit-loading")).toBeHidden();
    const last = ad.locator("[data-m4-look]").last();
    for (let i = 0; i < 3; i++) await hit(last);
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(ad.locator('[data-m4-look][aria-pressed="true"]')).toHaveCount(
      1,
    );
    await page.reload();
    await expect(ad).toHaveAttribute("data-interactive", "true");
    await hit(ad.locator("[data-m4-look]").nth(1));
    await expect(ad.locator("[data-m4-look]").nth(1)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(errors).toEqual([]);
  });

  test(`${locale} journal article preserves look preset, market and return path`, async ({
    page,
  }, info) => {
    const errors = errorsOn(page);
    await page.goto(magazine);
    const article = page
      .locator(".magazine-page .editorial-feature h2 a")
      .first();
    await expect(article).toBeVisible();
    await hit(article);
    const articleUrl = page.url();
    await expect(page.locator(".article-skus li[data-sku]")).toHaveCount(3);
    const fitting = page
      .locator('.article-shop a[href*="fitting-room"]')
      .first();
    await expect(fitting).toHaveAttribute(
      "href",
      /look=fixture-editorial-easy-days/,
    );
    await expect(fitting).toHaveAttribute(
      "href",
      new RegExp("market=" + market),
    );
    await hit(fitting);
    await expect(page.getByTestId("instant-fitting")).toBeVisible();
    await expect(
      page.locator('.moda-instant-models [data-model-kind="MAN"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".moda-instant-pieces > li")).toHaveCount(3);
    await page.screenshot({
      path: info.outputPath("article-preset.png"),
      fullPage: true,
    });
    const back = page
      .locator(`a[href="${new URL(articleUrl).pathname}"]`)
      .first();
    await expect(back).toBeVisible();
    await hit(back);
    await expect(page).toHaveURL(articleUrl);
    await page.goBack();
    await expect(page).toHaveURL(/fitting-room/);
    await page.goForward();
    await expect(page).toHaveURL(articleUrl);
    expect(errors).toEqual([]);
  });

  test(`${locale} real look purchase is idempotent and survives journal and checkout navigation`, async ({
    page,
  }, info) => {
    const errors = errorsOn(page);
    await page.goto(home + "/looks/easy-days");
    const pieces = page.locator(".editorial-piece");
    await expect(pieces).toHaveCount(3);
    for (const piece of await pieces.all()) {
      const size = piece.getByRole("combobox").last();
      const value = await size
        .locator('option[value]:not([value=""]):not([disabled])')
        .first()
        .getAttribute("value");
      expect(value).toBeTruthy();
      await size.selectOption(value!);
    }
    await expect(page.locator(".editorial-total bdi")).not.toBeEmpty();
    const add = page.locator(".editorial-total > button");
    await hit(add);
    await expect(add).toBeEnabled();
    await hit(add);
    await expect(add).toBeEnabled();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/cart?market=${market}`);
      const quantities = page.locator('main input[name="quantity"]');
      await expect(quantities).toHaveCount(3);
      for (const quantity of await quantities.all())
        await expect(quantity).toHaveValue("1");
      await page.goto(magazine);
      await expect(page.locator(".magazine-page h1")).toBeVisible();
      await page.goto(`/${locale}/checkout?market=${market}`);
      await expect(page.locator(".shop-checkout-piece")).toHaveCount(3);
      const next = page
        .locator("form")
        .filter({ has: page.locator('[name="firstName"]') })
        .getByRole("button")
        .last();
      await next.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await next.click({ trial: true });
      await page.screenshot({
        path: info.outputPath(`checkout-${locale}-${width}.png`),
        fullPage: true,
      });
    }
    // No place-order or payment request: validate the address/shipping step only.
    const address = page
      .locator("form")
      .filter({ has: page.locator('[name="firstName"]') });
    for (const [name, value] of Object.entries({
      firstName: "Fixture",
      lastName: "Buyer",
      email: "fixture@example.invalid",
      phone: "0000000000",
      province: "QA",
      city: "Fixture City",
      line1: "Fixture address",
      postalCode: "00000",
    })) {
      await address.locator(`input[name="${name}"]`).fill(value);
    }
    await hit(address.getByRole("button").last());
    await expect(page).toHaveURL(/step=2/);
    await page.reload();
    await expect(
      page.locator(".shop-checkout-steps li").nth(1),
    ).toHaveAttribute("aria-current", "step");
    expect(errors).toEqual([]);
  });
}
