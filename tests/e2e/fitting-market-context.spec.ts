import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
import { tokenHash } from "../../src/lib/secure-tokens";

const db = new PrismaClient();
const productId = "seed-moda4-style-kids-hoodie";
const variantId = "seed-moda4-seed-style-v2-kids-hoodie-4y";
const messages = { fa, tr, en };
type Locale = keyof typeof messages;
test.afterAll(() => db.$disconnect());

// Cron also refreshes FX when other browser cases deliver OTP email. Set a
// short-lived price for this exact variant to test tab isolation against a
// known amount in each market even if a rate changes during the exercise.
const pricedTest = test.extend<{ hoodiePrices: undefined }>({
  hoodiePrices: async ({}, use) => {
    const database = process.env.DATABASE_URL;
    if (!database || !new URL(database).pathname.endsWith("_test"))
      throw new Error(
        "Hoodie price fixture requires an isolated test database",
      );
    const marketPrices = [
      { code: "TR", currency: "TRY", amount: "1234.56" },
      { code: "CA", currency: "CAD", amount: "46.78" },
    ];
    const ids = marketPrices.map(() => randomUUID());
    try {
      for (const [index, price] of marketPrices.entries()) {
        const market = await db.market.findUniqueOrThrow({
          where: { code: price.code },
        });
        expect(market.currency).toBe(price.currency);
        await db.marketPrice.create({
          data: {
            id: ids[index],
            marketId: market.id,
            variantId,
            currency: price.currency,
            amount: price.amount,
          },
        });
      }
      await use(undefined);
    } finally {
      await db.marketPrice.deleteMany({ where: { id: { in: ids } } });
    }
  },
});

async function hoodiePrice(page: Page, locale: Locale, market: string) {
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
  });
  const slug = (product.slugI18n as Record<string, string>)[locale];
  await page.goto(
    `/${locale}/m/${market}/p/${encodeURIComponent(slug)}?color=seed-color-rust`,
  );
  await expect(
    page.locator('.shop-product-submit input[name="variantId"]'),
  ).toHaveValue(variantId);
  const price = (
    await page.locator(".moda-mobile-buy-price bdi").innerText()
  ).trim();
  expect(price).not.toBe("");
  return price;
}

async function cookie(page: Page, market: string) {
  await page
    .context()
    .addCookies([
      { name: "market", value: market, url: new URL(page.url()).origin },
    ]);
}
async function search(page: Page, locale: Locale) {
  const t = messages[locale].instantFitting;
  const room = page.getByTestId("instant-fitting");
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
  });
  await room
    .getByLabel(t.search, { exact: true })
    .fill((product.titleI18n as Record<string, string>)[locale]);
  await room.getByRole("button", { name: t.search, exact: true }).click();
  await expect(room).toHaveAttribute("aria-busy", "false");
  return room.locator(`[data-product-id="${productId}"]`);
}
async function choose(page: Page, locale: Locale) {
  const room = page.getByTestId("instant-fitting");
  await room.locator('[data-model-kind="BOY"]').click();
  const card = await search(page, locale);
  await card.locator("summary").click();
  await card.locator("select").selectOption(variantId);
  await card
    .getByRole("button", {
      name: messages[locale].instantFitting.try,
      exact: true,
    })
    .click();
  await expect(
    room.locator(`[data-fitting-piece-target="${variantId}"]`),
  ).toBeAttached();
  await expect(room).toHaveAttribute("aria-busy", "false");
  return card;
}

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`same exact hoodie variant: PDP, fitting and cart ${locale}/${market}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width: locale === "tr" ? 1440 : 390,
      height: 900,
    });
    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const slug = (product.slugI18n as Record<string, string>)[locale];
    await page.goto(
      `/${locale}/m/${market}/p/${encodeURIComponent(slug)}?color=seed-color-rust`,
    );
    await expect(
      page.locator('.shop-product-submit input[name="variantId"]'),
    ).toHaveValue(variantId);
    const price = (await page
      .locator(".moda-mobile-buy-price bdi")
      .textContent())!.trim();
    expect(price).not.toBe("");
    await page.screenshot({ path: info.outputPath(`pdp-${market}.png`) });
    await page.goto(`/${locale}/fitting-room?market=${market}`);
    // Simulate the cookie changed by a different tab, after this page rendered.
    await cookie(page, market === "IR" ? "CA" : "IR");
    const card = await choose(page, locale);
    await expect(card.locator(":scope > bdi")).toHaveText(price);
    await expect(page.locator(".moda-instant-pieces")).toContainText(price);
    await page.screenshot({
      path: info.outputPath(`fitting-${market}.png`),
      fullPage: true,
    });
    await page
      .getByTestId("instant-fitting")
      .getByRole("button", {
        name: messages[locale].instantFitting.addAll,
        exact: true,
      })
      .click();
    await expect(
      page.getByTestId("instant-fitting").getByRole("status"),
    ).toHaveText(messages[locale].instantFitting.added);
    const token = (await page.context().cookies()).find(
      (c) => c.name === "hoda.cart",
    )!.value;
    const cart = await db.cart.findUniqueOrThrow({
      where: { tokenHash: tokenHash(token) },
      include: { market: true, items: true },
    });
    expect(cart.market.code).toBe(market);
    expect(cart.currency).toBe(cart.market.currency);
    expect(cart.items.map((i) => i.variantId)).toEqual([variantId]);
    // Use the real mobile navigation / desktop drawer link carrying the page market.
    if (locale === "tr") {
      await page.locator(".storefront-cart-toggle").click();
      await page
        .locator(`dialog a[href="/${locale}/cart?market=${market}"]`)
        .click();
    } else {
      await page
        .locator(
          `.mobile-bottom-nav a[href="/${locale}/cart?market=${market}"]`,
        )
        .click();
    }
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/cart\\?market=${market}$`),
    );
    await expect(page.locator(".shop-cart-item")).toContainText(price);
    if (locale === "en") {
      const amounts = await page
        .locator(".shop-order-summary dd bdi")
        .allTextContents();
      expect(amounts.length).toBeGreaterThan(1);
      for (const value of amounts)
        expect(value.trim()).toMatch(/^CA\$[\d,]+\.\d{2}$/);
      await page.locator(".storefront-cart-toggle").click();
      const drawer = page.locator("dialog[open]");
      await expect(drawer.locator(".moda-drawer-total bdi").last()).toHaveText(
        amounts.at(-1)!,
      );
      await drawer
        .getByRole("button", { name: messages.en.shopping.close, exact: true })
        .click();
      await info.attach("verified-CAD-unit-and-total", {
        body: JSON.stringify({
          variantId,
          market,
          unitPrice: price,
          cartAmounts: amounts,
        }),
        contentType: "application/json",
      });
    }
    await page.screenshot({
      path: info.outputPath(`cart-${market}.png`),
      fullPage: true,
    });
  });
}

pricedTest(
  "two tabs, a delayed response, and country/language switches preserve their own market",
  async ({ page, context, hoodiePrices: _hoodiePrices }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const englishTR = await hoodiePrice(page, "en", "TR");
    const expectedTR = await hoodiePrice(page, "tr", "TR");
    expect(englishTR).toBe("₺1,234.56");
    expect(expectedTR).toBe("₺1.234,56");
    await page.goto("/tr/fitting-room?market=TR");
    const other = await context.newPage();
    const expectedCA = await hoodiePrice(other, "en", "CA");
    expect(expectedCA).toBe("CA$46.78");
    await other.goto("/en/fitting-room?market=CA");
    await cookie(page, "IR");
    let delayed = false;
    await page.route("**/tr/fitting-room?market=TR", async (route) => {
      if (route.request().method() === "POST" && !delayed) {
        delayed = true;
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 700));
        await route.fulfill({ response });
      } else await route.continue();
    });
    const [cardTR, cardCA] = await Promise.all([
      choose(page, "tr"),
      choose(other, "en"),
    ]);
    await expect(cardTR.locator(":scope > bdi")).toHaveText(expectedTR);
    await expect(cardCA.locator(":scope > bdi")).toHaveText(expectedCA);
    await expect(cardCA.locator(":scope > bdi")).not.toContainText("₺");
    await expect(cardCA.locator(":scope > bdi")).toContainText("CA$");
    expect(delayed).toBe(true);
    await page.unrouteAll({ behavior: "wait" });
    await page.locator('a[aria-label="English"]:visible').first().click();
    await expect(page).toHaveURL(/\/en\/fitting-room\?market=TR$/);
    await expect((await choose(page, "en")).locator(":scope > bdi")).toHaveText(
      englishTR,
    );
    await Promise.all([
      page.waitForURL(/\/en\/fitting-room\?market=CA$/, { waitUntil: "load" }),
      page
        .locator('select[aria-label="Choose a market"]')
        .first()
        .selectOption("CA"),
    ]);
    await expect(page).toHaveURL(/\/en\/fitting-room\?market=CA$/);
    await expect((await choose(page, "en")).locator(":scope > bdi")).toHaveText(
      expectedCA,
    );
    await other.close();
  },
);

pricedTest(
  "rejects a catalog response whose currency does not match the page",
  async ({ page, hoodiePrices: _hoodiePrices }) => {
    const expectedTR = await hoodiePrice(page, "tr", "TR");
    expect(expectedTR).toBe("₺1.234,56");
    await page.goto("/tr/fitting-room?market=TR");
    await page
      .getByTestId("instant-fitting")
      .locator('[data-model-kind="BOY"]')
      .click();
    let injected = false;
    await page.route("**/tr/fitting-room?market=TR", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      let body = await response.text();
      if (body.includes('"products":') && !injected) {
        injected = true;
        body = body
          .replaceAll('"currency":"TRY"', '"currency":"IRT"')
          .replaceAll(/"amount":"[0-9.]+"/g, '"amount":"1920000"');
        expect(body).toContain('"amount":"1920000"');
      }
      await route.fulfill({ response, body });
    });
    const card = await search(page, "tr");
    expect(injected).toBe(true);
    await expect(card.locator(":scope > bdi")).toHaveText(expectedTR);
    await expect(page.getByTestId("instant-fitting")).not.toContainText(
      "1.920.000",
    );
  },
);

test("zero-stock and subsequently deleted synthetic variant cannot be selected", async ({
  page,
}) => {
  const original = await db.variant.findUniqueOrThrow({
    where: { id: variantId },
    include: { size: true },
  });
  const size = await db.size.create({
    data: {
      value: `S0-${randomUUID()}`,
      scale: original.size.scale,
      groupKey: original.size.groupKey,
    },
  });
  let temporary: string | undefined;
  try {
    temporary = (
      await db.variant.create({
        data: {
          productId,
          colorId: original.colorId,
          sizeId: size.id,
          sku: `S0-${randomUUID()}`,
        },
      })
    ).id;
    await page.goto("/tr/fitting-room?market=TR");
    await page
      .getByTestId("instant-fitting")
      .locator('[data-model-kind="BOY"]')
      .click();
    const card = await search(page, "tr");
    await card.locator("summary").click();
    await expect(card.locator(`option[value="${temporary}"]`)).toHaveAttribute(
      "disabled",
      "",
    );
    expect(
      await card
        .locator(`option[value="${temporary}"]`)
        .evaluate((option) => (option as HTMLOptionElement).disabled),
    ).toBe(true);
    const deletedId = temporary;
    await db.variant.delete({ where: { id: temporary } });
    temporary = undefined;
    await search(page, "tr");
    await expect(card.locator(`option[value="${deletedId}"]`)).toHaveCount(0);
    await expect(card.locator("option")).toHaveCount(7);
  } finally {
    if (temporary) await db.variant.delete({ where: { id: temporary } });
    await db.size.delete({ where: { id: size.id } });
  }
});
