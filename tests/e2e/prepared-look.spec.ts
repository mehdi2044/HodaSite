import { test, expect } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { shoppingProof } from "./helpers/shopping-proof";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`${locale}: prepared model selection, selected pieces, cart and checkout`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const imageCalls: string[] = [];
    page.on("request", (request) => {
      if (/fashn|fal\.ai|api\.openai\.com|replicate/.test(request.url()))
        imageCalls.push(request.url());
    });
    const marketState = await db.market.findUniqueOrThrow({
      where: { code: market },
    });
    const precisionPrices =
      locale === "fa"
        ? ["1790000.1001", "2290000.2002", "3190000.3003"]
        : ["19.0001", "23.0002", "31.0003"];
    const firstPiecePrice = {
      fa: "۱٬۷۹۰٬۰۰۰٫۱۰۰۱ تومان",
      tr: "₺19,0001",
      en: "CA$19.0001",
    }[locale];
    const expectedSubtotal = {
      fa: "۷٬۲۷۰٬۰۰۰٫۶۰۰۶ تومان",
      tr: "₺73,0006",
      en: "CA$73.0006",
    }[locale];
    const priceIds = precisionPrices.map(() => randomUUID());
    const precisionVariants = [
      "seed-style-v2-women-coat-m",
      "seed-style-v2-women-tee-m",
      "seed-style-v2-women-trousers-m",
    ];
    try {
      await db.market.update({
        where: { id: marketState.id },
        data: { roundingRule: { mode: "HALF_UP", increment: "0.0001" } },
      });
      await db.marketPrice.createMany({
        data: precisionPrices.map((amount, i) => ({
          id: priceIds[i],
          variantId: precisionVariants[i],
          marketId: marketState.id,
          currency: marketState.currency,
          amount,
          validFrom: new Date(),
        })),
      });
      await page.goto(`/${locale}/m/${market}`);
      const studio = page.getByTestId("shop-look-studio").first();
      await expect(studio).toBeVisible();
      await expect(async () => {
        await page.goto(`/${locale}/m/${market}`);
        await studio.locator("select").first().selectOption({ label: "M" });
        await expect(studio.locator(".look-piece-price").first()).toHaveText(
          firstPiecePrice,
        );
      }).toPass({ timeout: 15000, intervals: [1000] });
      await page.goto(`/${locale}/m/${market}`);
      const tabs = studio.locator(".look-tabs button");
      await expect(tabs).toHaveCount(4);
      const firstImage = await studio
        .locator(".look-model img")
        .getAttribute("src");
      await tabs.nth(1).click();
      await expect(studio.locator(".look-model img")).not.toHaveAttribute(
        "src",
        firstImage!,
      );
      await expect(studio.locator(".look-item")).toHaveCount(3);
      await tabs.first().click();
      await expect(studio.locator(".look-item")).toHaveCount(4);
      await expect(studio.locator(".look-add")).toBeDisabled();
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await studio.scrollIntoViewIfNeeded();
        await studio.locator("img").evaluateAll(async (images) => {
          await Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          );
        });
        const sceneBox = await studio.locator(".look-scene").boundingBox();
        const noteBox = await studio.locator(".look-image-note").boundingBox();
        expect(noteBox!.y).toBeGreaterThan(sceneBox!.y + sceneBox!.height);
        await shoppingProof(page, info, `prepared-look-${locale}-${width}`);
        await page.screenshot({
          path: info.outputPath(
            `shopping-prepared-home-full-${locale}-${width}.png`,
          ),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(studio.locator(".look-plane").first()).toHaveCSS(
        "transform",
        "none",
      );
      await studio.locator(".look-item input[type=checkbox]").nth(3).uncheck();
      const sizes = studio.locator("select:enabled");
      await expect(sizes).toHaveCount(3);
      for (let index = 0; index < 3; index++)
        await sizes.nth(index).selectOption({ label: "M" });
      // Direct DB fixtures may wait for the documented 5-second market cache.
      // Verify the actual four-decimal piece price before continuing with sizes.
      await expect(studio.locator(".look-piece-price").first()).toHaveText(
        firstPiecePrice,
      );
      await expect(studio.locator(".look-total strong")).toHaveText(
        expectedSubtotal,
      );
      await expect(studio.locator(".look-add")).toBeEnabled();
      await studio.locator(".look-add").click();
      await expect(studio.locator(".look-add")).toContainText(
        { fa: "به سبد اضافه شد", tr: "Sepete eklendi", en: "Added to bag" }[
          locale
        ],
      );
      expect(imageCalls).toEqual([]);
      await page.goto(`/${locale}/cart`);
      await expect(page.locator(".shop-cart-item")).toHaveCount(3);
      await expect(page.locator(".shop-order-summary dd").first()).toHaveText(
        expectedSubtotal,
      );
      await shoppingProof(page, info, `prepared-cart-${locale}`);
      await page.goto(`/${locale}/checkout`);
      await expect(page.locator(".shop-checkout-piece")).toHaveCount(3);
      await expect(page.locator(".shop-checkout-summary")).toContainText(
        expectedSubtotal,
      );
      await expect(page.locator(".shop-checkout-summary img")).toHaveCount(3);
      await shoppingProof(page, info, `prepared-checkout-${locale}`);
      const marketRow = await db.market.findFirstOrThrow({
        where: { code: market },
      });
      const home = await db.homepage.findFirstOrThrow({
        where: { marketId: null, deletedAt: null },
      });
      expect(marketRow.isActive).toBe(true);
      expect(JSON.stringify(home.blocks)).toContain("ShopLook");
      const category = await db.category.findUniqueOrThrow({
        where: { id: "seed-category-women" },
      });
      await page.goto(
        `/${locale}/m/${market}/c/${encodeURIComponent((category.slugI18n as Record<string, string>)[locale])}`,
      );
      await expect(page.locator(".shop-subcategories a")).toHaveCount(5);
      await expect(page.getByTestId("shop-look-studio")).toBeVisible();
      const garment = page
        .getByTestId("shop-look-studio")
        .locator(".look-item-title a")
        .first();
      await garment.click();
      await expect(page.locator(".shop-product-title")).toBeVisible();
      await expect(page.getByTestId("shop-look-studio")).toBeVisible();
      await shoppingProof(page, info, `prepared-product-${locale}`);
      const nested = await db.category.findUniqueOrThrow({
        where: { id: "seed-category-seed-category-kids-girls-tops" },
      });
      await page.goto(
        `/${locale}/m/${market}/c/${encodeURIComponent((nested.slugI18n as Record<string, string>)[locale])}`,
      );
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        (nested.titleI18n as Record<string, string>)[locale],
      );
      await expect(page.getByTestId("shop-look-studio")).toBeVisible();
    } finally {
      await db.marketPrice.deleteMany({ where: { id: { in: priceIds } } });
      await db.market.update({
        where: { id: marketState.id },
        data: {
          roundingRule: marketState.roundingRule as Prisma.InputJsonValue,
        },
      });
    }
  });
}
