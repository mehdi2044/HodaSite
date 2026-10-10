import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { customerLogin } from "./helpers/crm-customer";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";
import { fillAdminMfa } from "./helpers/admin-mfa";
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
for (const locale of ["fa", "tr", "en"] as const) {
  test(`${locale}: fixed models, actual variant color, wardrobe and no-charge provider fallback`, async ({
    page,
  }, info) => {
    test.setTimeout(150000);
    const old = await db.integration.findUniqueOrThrow({
        where: { key: "fitting-room" },
      }),
      config = old.config as Record<string, unknown>;
    const email = `fit-browser-${randomUUID()}@example.com`;
    await db.integration.update({
      where: { id: old.id },
      data: {
        isActive: true,
        config: { ...config, enabled: true, coinSalesEnabled: true },
      },
    });
    try {
      await customerLogin(page, email, locale);
      await page.goto(`/${locale}/fitting-room`);
      const room = page.getByTestId("fitting-room");
      await expect(room).toBeVisible();
      await expect(room.locator(".fitting-models button")).toHaveCount(4);
      const tee = room.locator(".fitting-product").filter({
        has: page.locator('option[value="seed-style-v2-women-tee-charcoal-m"]'),
      });
      await expect(tee).toBeVisible();
      const ivory = await db.productMedia.findFirstOrThrow({
        where: { productId: "seed-style-v2-women-tee" },
        orderBy: { sortOrder: "asc" },
        include: { media: true },
      });
      const charcoal = await db.variantMedia.findFirstOrThrow({
        where: { variantId: "seed-style-v2-women-tee-charcoal-m" },
        orderBy: { sortOrder: "asc" },
        include: { media: true },
      });
      expect(ivory.media.url).not.toBe(charcoal.media.url);
      await tee.locator("select").selectOption("seed-style-v2-women-tee-m");
      await expect(tee.locator("img")).toHaveAttribute("src", ivory.media.url);
      await tee
        .locator("select")
        .selectOption("seed-style-v2-women-tee-charcoal-m");
      await expect(tee.locator("img")).toHaveAttribute(
        "src",
        charcoal.media.url,
      );
      await expect(room.locator(".fitting-chip")).toHaveCount(1);
      const customer = await db.customer.findUniqueOrThrow({
        where: { email },
      });
      const before = await db.fittingCoinEntry.count({
        where: { customerId: customer.id, reason: "FITTING" },
      });
      await room.locator(".fitting-generate").click();
      await expect(room.getByRole("alert")).toBeVisible();
      expect(
        await db.fittingCoinEntry.count({
          where: { customerId: customer.id, reason: "FITTING" },
        }),
      ).toBe(before);
      await room.locator(".fitting-add").click();
      await expect(
        room.locator(".fitting-selection [role=status]"),
      ).toContainText({ fa, tr, en }[locale].fitting.added);
      const cardImage =
        (charcoal.media.variants as { webp?: Record<string, { url: string }> })
          .webp?.["960"]?.url ?? charcoal.media.url;
      await page.goto(`/${locale}/cart`);
      await expect(page.locator(".shop-cart-image img")).toHaveAttribute(
        "src",
        cardImage,
      );
      await page.locator(".storefront-cart-toggle").click();
      await expect(
        page.locator(".storefront-mini-cart-item img"),
      ).toHaveAttribute("src", cardImage);
      await page.goto(`/${locale}/checkout`);
      await expect(page.locator(".shop-checkout-piece img")).toHaveAttribute(
        "src",
        cardImage,
      );
      await page.goto(`/${locale}/fitting-room`);
      await room.locator(".fitting-models button").nth(2).click();
      await expect(room.locator(".fitting-chip")).toHaveCount(0);
      await expect(room.locator(".fitting-portrait img")).toHaveAttribute(
        "src",
        /media/,
      );
      await room.locator(".fitting-source button").nth(1).click();
      await expect(room.locator(".fitting-product")).toHaveCount(0);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await room
          .locator(".fitting-portrait img")
          .evaluate((img) => (img as HTMLImageElement).decode());
        await room.locator(".fitting-models").scrollIntoViewIfNeeded();
        await shoppingProof(page, info, `custom-fitting-${locale}-${width}`);
        await page.screenshot({
          path: info.outputPath(
            `shopping-custom-fitting-full-${locale}-${width}.png`,
          ),
          fullPage: true,
        });
      }
      await page.goto(`/${locale}/fitting-room/coins`);
      await expect(page.locator(".fitting-packs")).toBeVisible();
    } finally {
      await db.integration.update({
        where: { id: old.id },
        data: { isActive: old.isActive, config: old.config! },
      });
    }
  });
}
test("admin config toggle and fractional charge persist through real authorized actions", async ({
  page,
}) => {
  test.setTimeout(120000);
  const old = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  await page.goto("/admin/login");
  await page
    .locator("[name=email]")
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator("[name=password]")
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: /ورود|Login|Giriş/ }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  try {
    await page.goto("/admin/settings/fitting");
    await expect(
      page.getByLabel(fa.fitting.costCoins, { exact: true }),
    ).toHaveValue("12.5");
    await page.getByLabel(fa.fitting.costCoins, { exact: true }).fill("13.5");
    await page.getByLabel(fa.fitting.coinSalesEnabled, { exact: true }).check();
    await page.getByLabel(fa.fitting.confirmAdmin, { exact: true }).check();
    await page
      .getByRole("button", { name: fa.fitting.saveSettings, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            (await db.integration.findUniqueOrThrow({ where: { id: old.id } }))
              .config as { costCoins: string }
          ).costCoins,
      )
      .toBe("13.5");
    await expect(
      page.getByLabel(fa.fitting.enabled, { exact: true }),
    ).not.toBeChecked();
    await expect(page.locator("main")).toContainText(/مدل|Model/);
  } finally {
    await db.integration.update({
      where: { id: old.id },
      data: { isActive: old.isActive, config: old.config! },
    });
  }
});

test("coin listing survives an active pack with no active variants", async ({
  page,
}) => {
  const original = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  const pack = await db.product.findUniqueOrThrow({
    where: { id: "seed-fitting-pack-100" },
  });
  const variant = await db.variant.findUniqueOrThrow({
    where: { id: "seed-fitting-pack-100-digital" },
  });
  try {
    await db.integration.update({
      where: { id: original.id },
      data: {
        isActive: true,
        config: {
          ...(original.config as Record<string, unknown>),
          enabled: true,
          coinSalesEnabled: true,
        },
      },
    });
    await db.product.update({
      where: { id: pack.id },
      data: { status: "ACTIVE" },
    });
    await db.variant.update({
      where: { id: variant.id },
      data: { isActive: false },
    });
    await page.goto("/en/fitting-room/coins");
    await expect(page.locator(".fitting-packs")).toBeVisible();
    await expect(page.locator(".fitting-packs")).toContainText(
      en.fitting.packsDisabled,
    );
    await expect(page.locator(".fitting-packs article")).toHaveCount(0);
  } finally {
    await db.variant.update({
      where: { id: variant.id },
      data: { isActive: variant.isActive },
    });
    await db.product.update({
      where: { id: pack.id },
      data: { status: pack.status },
    });
    await db.integration.update({
      where: { id: original.id },
      data: { isActive: original.isActive, config: original.config! },
    });
  }
});
