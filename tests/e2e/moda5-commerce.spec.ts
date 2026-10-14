import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { tokenHash } from "../../src/lib/secure-tokens";
import { formatStorefrontAmount } from "../../src/modules/catalog/format";
import { fillAdminMfa } from "./helpers/admin-mfa";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
const db = new PrismaClient(),
  id = `r5-browser-${randomUUID()}`;
const titles = {
  fa: "محصول واقعی آزمون خرید",
  tr: "Gerçek alışveriş denemesi",
  en: "Actual R5 purchase fixture",
};
let market: Awaited<ReturnType<typeof db.market.findUniqueOrThrow>>;
let originalLocales: string[] = [],
  ivory = "",
  charcoal = "",
  sizeM = "",
  sizeL = "";
let colorNames: Record<string, Record<string, string>> = {};
const variants: string[] = [];
let expectedImages: string[] = [];
test.beforeAll(async () => {
  market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
  originalLocales = market.enabledLocales;
  await db.market.update({
    where: { id: market.id },
    data: { enabledLocales: ["fa", "tr", "en"] },
  });
  await db.category.create({
    data: {
      id: `${id}-category`,
      parentId: "seed-category-women",
      gender: "WOMEN",
      titleI18n: titles,
      slugI18n: { fa: id, tr: id, en: id },
    },
  });
  await db.collection.create({
    data: {
      id: `${id}-collection`,
      titleI18n: titles,
      slug: id,
    },
  });
  const base = await db.media.findUniqueOrThrow({
    where: { id: "seed-fashion-v2-women-tee" },
  });
  await db.product.create({
    data: {
      id,
      titleI18n: titles,
      descriptionI18n: titles,
      slugI18n: { fa: id, tr: id, en: id },
      categoryId: `${id}-category`,
      gender: "WOMEN",
      status: "ACTIVE",
      basePriceAmount: "25",
      basePriceCurrency: "USD",
      marketIds: [market.id],
      tags: ["r5-fixture"],
      searchText: id,
      collections: { connect: { id: `${id}-collection` } },
      media: { create: { mediaId: base.id, sortOrder: 0 } },
    },
  });
  for (const [n, key, qty, amount] of [
    [0, "seed-style-v2-women-tee-m", 5, "40.5000"],
    [1, "seed-style-v2-women-tee-charcoal-m", 0, "99.0000"],
    [2, "seed-style-v2-women-tee-charcoal-l", 7, "100.2500"],
  ] as const) {
    const source = await db.variant.findUniqueOrThrow({
      where: { id: key },
      include: {
        color: true,
        stockItems: true,
        media: { include: { media: true } },
      },
    });
    if (n === 0) {
      ivory = source.colorId;
      sizeM = source.sizeId;
    } else {
      charcoal = source.colorId;
      sizeL = source.sizeId;
    }
    colorNames[source.colorId] = source.color.nameI18n as Record<
      string,
      string
    >;
    const variant = await db.variant.create({
      data: {
        id: `${id}-${n}`,
        sku: `${id}-${n}`.toUpperCase(),
        productId: id,
        colorId: source.colorId,
        sizeId: source.sizeId,
        isActive: true,
        media: {
          create: source.media.map((link) => ({
            mediaId: link.mediaId,
            sortOrder: link.sortOrder,
          })),
        },
      },
    });
    variants.push(variant.id);
    await db.stockItem.create({
      data: {
        variantId: variant.id,
        warehouseId: source.stockItems[0].warehouseId,
        onHand: qty,
        reserved: 0,
      },
    });
    await db.marketPrice.create({
      data: {
        marketId: market.id,
        variantId: variant.id,
        amount,
        compareAtAmount: n === 0 ? "55.0000" : null,
        currency: "CAD",
        validFrom: new Date("2000-01-01T00:00:00Z"),
      },
    });
    if (n === 2) {
      const image = source.media[0].media;
      expectedImages = [image.url];
      const values = image.variants as Record<
        string,
        Record<string, { url: string }>
      >;
      for (const group of Object.values(values ?? {}))
        for (const item of Object.values(group))
          if (item.url) expectedImages.push(item.url);
    }
  }
});
test.afterAll(async () => {
  await db.cartItem.deleteMany({ where: { variantId: { in: variants } } });
  await db.marketPrice.deleteMany({ where: { variantId: { in: variants } } });
  await db.stockItem.deleteMany({ where: { variantId: { in: variants } } });
  await db.variant.deleteMany({ where: { id: { in: variants } } });
  await db.product.deleteMany({ where: { id } });
  await db.collection.deleteMany({ where: { id: `${id}-collection` } });
  await db.category.deleteMany({ where: { id: `${id}-category` } });
  if (market)
    await db.market.update({
      where: { id: market.id },
      data: { enabledLocales: originalLocales },
    });
  await db.$disconnect();
});
for (const locale of ["fa", "tr", "en"] as const) {
  test(`R5 ${locale}: real search/category filters, history, colour/size price and cart-drawer mutations`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120000);
    const t = { fa, tr, en }[locale];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/m/CA/c/${id}`);
    await page
      .getByRole("button", { name: t.catalog.filters, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: t.catalog.filters });
    await dialog.locator('select[name="color"]').selectOption(ivory);
    await dialog.locator('select[name="size"]').selectOption(sizeM);
    await dialog
      .getByRole("button", { name: t.catalog.apply, exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("color"))
      .toBe(ivory);
    const removeColor = t.shopping.removeFilter.replace(
      "{filter}",
      `${t.catalog.color} ${colorNames[ivory][locale]}`,
    );
    await page
      .getByRole("group", { name: t.shopping.activeFilters })
      .getByRole("button", { name: removeColor, exact: true })
      .click();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("color"))
      .toBe(false);
    expect(new URL(page.url()).searchParams.get("size")).toBe(sizeM);
    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("color"))
      .toBe(ivory);
    await page.goForward();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("color"))
      .toBe(false);
    await page.goto(
      `/${locale}/search?${new URLSearchParams({ market: "CA", q: id, collectionId: `${id}-collection`, color: ivory, size: sizeM, min: "1000" })}`,
    );
    await expect(page.locator("main .shop-product-card")).toHaveCount(0);
    await page
      .locator("main")
      .getByRole("link", { name: t.shopping.reset, exact: true })
      .click();
    expect(new URL(page.url()).searchParams.get("collectionId")).toBe(
      `${id}-collection`,
    );
    await expect(page.locator("main .shop-product-card")).toHaveCount(1);
    const card = page.locator("main .shop-product-card");
    await card
      .getByRole("button", { name: colorNames[charcoal][locale], exact: true })
      .click();
    await card
      .getByRole("button", {
        name: t.shopping.quickAddSize.replace("{size}", "L"),
        exact: true,
      })
      .click();
    await expect(
      card.getByRole("status").filter({ hasText: t.commerce.saved }),
    ).toBeVisible();
    await page.goto(`/${locale}/m/CA/p/${id}?color=${charcoal}`);
    const purchase = page.locator(".shop-product-submit");
    await expect(purchase.locator('input[name="variantId"]')).toHaveValue(
      variants[2],
    );
    await expect(page.getByTestId("product-price")).toContainText(
      formatStorefrontAmount("100.25", "CAD", locale),
    );
    await expect(page.getByTestId("product-price").locator("del")).toHaveCount(
      0,
    );
    await expect(purchase.locator(".moda-mobile-buy-price")).toContainText(
      formatStorefrontAmount("100.25", "CAD", locale),
    );
    await expect
      .poll(() =>
        page
          .locator(".shop-gallery-track img")
          .first()
          .evaluate((image) => {
            const url = (image as HTMLImageElement).currentSrc;
            return url ? new URL(url).pathname : "";
          }),
      )
      .toBeTruthy();
    const displayed = await page
      .locator(".shop-gallery-track img")
      .first()
      .evaluate(
        (image) => new URL((image as HTMLImageElement).currentSrc).pathname,
      );
    expect(
      expectedImages.some(
        (url) => displayed === new URL(url, "http://127.0.0.1:3000").pathname,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: colorNames[ivory][locale], exact: true })
      .click();
    await expect(purchase.locator('input[name="variantId"]')).toHaveValue(
      variants[0],
    );
    await expect(page.getByTestId("product-price")).toContainText(
      formatStorefrontAmount("40.5", "CAD", locale),
    );
    await expect(page.getByTestId("product-price").locator("del")).toHaveText(
      formatStorefrontAmount("55", "CAD", locale),
    );
    await purchase.locator(".shop-add-button").click();
    await expect(
      purchase.getByRole("status").filter({ hasText: t.commerce.saved }),
    ).toBeVisible();
    await page.locator(".storefront-cart-toggle").click();
    const cart = page.locator(".moda-cart-drawer");
    await expect(cart).toBeVisible();
    const row = cart.locator("article").filter({
      has: page.locator(`input[name="variantId"][value="${variants[2]}"]`),
    });
    await row
      .getByRole("button", {
        name: t.shopping.increaseQuantity.replace("{product}", titles[locale]),
        exact: true,
      })
      .click();
    const cookie = (await context.cookies()).find(
      (cookie) => cookie.name === "hoda.cart",
    )!;
    await expect
      .poll(
        async () =>
          (
            await db.cart.findUniqueOrThrow({
              where: { tokenHash: tokenHash(cookie.value) },
              include: { items: true },
            })
          ).items.find((item) => item.variantId === variants[2])?.quantity,
      )
      .toBe(2);
    await expect(cart).toBeVisible();
    await row
      .getByRole("button", { name: t.shopping.remove, exact: true })
      .click();
    await expect
      .poll(async () =>
        (
          await db.cart.findUniqueOrThrow({
            where: { tokenHash: tokenHash(cookie.value) },
            include: { items: true },
          })
        ).items.map((item) => item.variantId),
      )
      .toEqual([variants[0]]);
    await cart
      .getByRole("link", { name: t.commerce.viewCart, exact: true })
      .click();
    await page
      .locator("main")
      .getByRole("link", { name: t.commerce.checkout, exact: true })
      .click();
    await expect(page.locator('main input[name="firstName"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`r5-checkout-${locale}-390.png`),
      scale: "css",
    });
  });
}
test("R5 actual product editor flag saves, reloads and changes the public badge", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/admin/login");
  await page
    .locator('input[name="email"]')
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator('input[name="password"]')
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
  await context.addCookies([
    { name: "hoda.admin.locale", value: "en", url: info.project.use.baseURL! },
  ]);
  await page.goto(`/admin/catalog/products/${id}`);
  const flag = page.getByRole("checkbox", {
    name: en.catalogAdmin.newArrival,
    exact: true,
  });
  await flag.check();
  const form = page
    .locator("form")
    .filter({ has: page.locator(`input[name="id"][value="${id}"]`) });
  await form.locator('button[type="submit"]').click();
  await expect
    .poll(async () =>
      (await db.product.findUniqueOrThrow({ where: { id } })).tags.includes(
        "merchandising:new",
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(flag).toBeChecked();
  const shop = await context.newPage();
  await shop.goto(`/en/m/CA/p/${id}`);
  await expect(
    shop.locator("main").getByText(en.catalog.newBadge, { exact: true }),
  ).toBeVisible();
  await flag.uncheck();
  await form.locator('button[type="submit"]').click();
  await expect
    .poll(async () =>
      (await db.product.findUniqueOrThrow({ where: { id } })).tags.includes(
        "merchandising:new",
      ),
    )
    .toBe(false);
  await shop.reload();
  await expect(
    shop.locator("main").getByText(en.catalog.newBadge, { exact: true }),
  ).toHaveCount(0);
  await shop.close();
});
