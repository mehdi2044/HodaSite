import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { promotionInput } from "../helpers/promotion-program";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
for (const [locale, marketCode, province, city, postalCode] of [
  ["fa", "IR", "تهران", "تهران", "1234567890"],
  ["tr", "TR", "İstanbul", "Kadıköy", "34710"],
  ["en", "CA", "ON", "Toronto", "M5V 2T6"],
] as const) {
  test(`${locale} coupon cart, checkout and immutable order at 390px`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120000);
    const t = { fa, tr, en }[locale].commerce;
    const market = await db.market.findUniqueOrThrow({
      where: { code: marketCode },
    });
    const variant = await db.variant.findFirstOrThrow({
      where: {
        isActive: true,
        product: { slugI18n: { path: ["en"], equals: "product-1" } },
      },
      include: { product: true },
    });
    const id = randomUUID(),
      token = randomUUID(),
      code = `BROWSER-${randomUUID()}`.toUpperCase();
    const raw = promotionInput(market.id, variant.productId),
      config = {
        ...raw.config,
        definition: {
          ...raw.config.definition,
          effect: { type: "freeShipping" },
        },
        id,
        revision: 1,
        marketId: market.id,
        currency: market.currency,
      };
    await db.promotionProgram.create({
      data: {
        id,
        marketId: market.id,
        currency: market.currency,
        revisions: {
          create: {
            version: 1,
            name: raw.name,
            description: raw.description,
            category: raw.category,
            ownerNotes: raw.ownerNotes,
            titleI18n: raw.titleI18n,
            descriptionI18n: raw.descriptionI18n,
            config,
            actorId: "browser-fixture",
            mutationKey: randomUUID(),
            mutationHash: randomUUID(),
          },
        },
      },
    });
    await db.promotionCoupon.create({
      data: {
        marketId: market.id,
        programId: id,
        code,
        startsAt: new Date("2020-01-01"),
        totalUsageCap: 1,
        actorId: "browser-fixture",
        mutationKey: randomUUID(),
        mutationIndex: 0,
        mutationHash: randomUUID(),
      },
    });
    const address = {
      firstName: "Test",
      lastName: "Buyer",
      email: `browser-${randomUUID()}@example.com`,
      phone: "+90 555 000 0000",
      country: marketCode,
      province,
      city,
      postalCode,
      line1: "Example Street 10",
      line2: "",
      note: "",
    };
    const shipping = await db.feeRule.create({
      data: {
        marketId: market.id,
        currency: market.currency,
        type: "SHIPPING",
        method: "FIXED",
        labelI18n: {
          fa: "ارسال منتخب",
          tr: "Seçilen teslimat",
          en: "Selected shipping",
        },
        province,
        city,
        postalPrefix: postalCode.slice(0, 3),
        params: { amount: "37" },
        selectable: true,
        validFrom: new Date(0),
      },
    });
    const cart = await db.cart.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        marketId: market.id,
        currency: market.currency,
        locale,
        expiresAt: new Date(Date.now() + 86400000),
        checkout: { ...address, shippingRuleId: shipping.id },
        items: { create: { variantId: variant.id, quantity: 1 } },
      },
    });
    try {
      await context.addCookies([
        {
          name: "hoda.cart",
          value: token,
          url: "http://127.0.0.1:3000",
          httpOnly: true,
          sameSite: "Lax",
        },
        { name: "market", value: marketCode, url: "http://127.0.0.1:3000" },
      ]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${locale}/cart`);
      await page.getByLabel(t.couponCodes).fill(code.toLowerCase());
      await page
        .getByRole("button", { name: t.applyCoupons, exact: true })
        .click();
      await expect(page.getByTestId("discount-line")).toHaveText(
        new RegExp(raw.titleI18n[locale]),
      );
      await expect(page.getByLabel(t.couponCodes)).toHaveValue(code);
      await expect(page.getByTestId("discount-line")).toContainText(
        `37.0000 ${market.currency}`,
      );
      const cartTotal = await page
        .locator("aside dl div")
        .filter({ has: page.getByText(t.total, { exact: true }) })
        .locator("dd")
        .innerText();
      await page.screenshot({
        path: info.outputPath(`${locale}-coupon-cart.png`),
        fullPage: true,
      });
      await page.goto(`/${locale}/checkout?step=3`);
      await expect(page.getByTestId("discount-line")).toContainText(
        raw.titleI18n[locale],
      );
      expect(await page.locator("html").getAttribute("dir")).toBe(
        locale === "fa" ? "rtl" : "ltr",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      const expectedTotal = await page
        .locator('[name="expectedTotal"]')
        .inputValue();
      expect(cartTotal).toContain(`${expectedTotal} ${market.currency}`);
      // Returning to the cart must retain the selected delivery discount and total.
      await page.goto(`/${locale}/cart`);
      await expect(page.getByTestId("discount-line")).toContainText(
        `37.0000 ${market.currency}`,
      );
      await db.cart.update({
        where: { id: cart.id },
        data: {
          checkout: {
            ...address,
            couponCodes: [code],
            shippingRuleId: "missing-shipping",
          },
        },
      });
      await page.reload();
      await expect(page.getByRole("alert")).toHaveText(
        t.errors.QUOTE_UNAVAILABLE,
      );
      await expect(page.getByTestId("discount-line")).toHaveCount(0);
      await page.getByRole("link", { name: t.checkout, exact: true }).click();
      await page.getByLabel(t.shippingMethod).selectOption(shipping.id);
      await page.getByRole("button", { name: t.next, exact: true }).click();
      await expect(page).toHaveURL(/checkout\?step=3/);
      await expect(page.locator('[name="expectedTotal"]')).toHaveValue(
        expectedTotal,
      );
      await page.screenshot({
        path: info.outputPath(`${locale}-coupon-checkout.png`),
        fullPage: true,
      });
      await page.locator('[name="terms"]').check();
      await page
        .getByRole("button", { name: t.placeOrder, exact: true })
        .click();
      await expect(page).toHaveURL(/\/orders\/[^/]+\/pay/);
      await expect(page.getByTestId("discount-line")).toContainText(
        raw.titleI18n[locale],
      );
      const order = await db.order.findUniqueOrThrow({
        where: { cartId: cart.id },
        include: { promotionEvaluation: { include: { redemptions: true } } },
      });
      expect(order.totalAmount.toString()).toBe(expectedTotal);
      expect(order.discountAmount.toFixed(4)).toBe("37.0000");
      expect(order.promotionEvaluation?.redemptions).toHaveLength(1);
    } finally {
      await db.feeRule.update({
        where: { id: shipping.id },
        data: { isActive: false },
      });
      await db.promotionProgram.update({
        where: { id },
        data: {
          version: 2,
          revisions: {
            create: {
              version: 2,
              name: raw.name,
              description: raw.description,
              category: raw.category,
              ownerNotes: raw.ownerNotes,
              titleI18n: raw.titleI18n,
              descriptionI18n: raw.descriptionI18n,
              config: { ...config, revision: 2, status: "ARCHIVED" },
              actorId: "browser-fixture",
              mutationKey: randomUUID(),
              mutationHash: randomUUID(),
            },
          },
        },
      });
    }
  });
}
test.afterAll(() => db.$disconnect());
