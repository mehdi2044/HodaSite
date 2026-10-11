import { test, expect } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { tokenHash } from "../../src/lib/secure-tokens";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

test("canonical cart link refreshes the header and engagement market context", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await ensureMaintenanceOff(page.request);
  await page.setViewportSize({ width: 1280, height: 900 });
  const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  const token = randomUUID();
  const cart = await db.cart.create({
    data: {
      tokenHash: tokenHash(token),
      marketId: market.id,
      currency: market.currency,
      locale: "en",
      expiresAt: new Date(Date.now() + 86400000),
      items: {
        create: { variantId: "seed-style-v2-women-tee-m", quantity: 1 },
      },
    },
  });
  try {
    await context.addCookies([
      {
        name: "hoda.cart",
        value: token,
        url: "http://127.0.0.1:3000",
        httpOnly: true,
      },
    ]);
    await page.goto("/en/m/CA");
    const switcher = page.getByRole("combobox", { name: "Choose a market" });
    await expect(switcher).toHaveValue("CA");
    await page.goto("/en/cart");
    await expect(switcher).toHaveValue("CA");
    const link = page.locator(".shop-cart-item-body a").first();
    await expect(link).toHaveAttribute("href", /^\/en\/m\/TR\/p\//);
    // This is the real Next.js Link from a retained CA layout to a TR product.
    await link.click();
    await expect(page).toHaveURL(/\/en\/m\/TR\/p\//);
    await expect(page.locator(".shop-product-title")).toBeVisible();
    await expect(switcher).toHaveValue("TR");
    await expect(
      page.locator(".storefront-departments a").first(),
    ).toHaveAttribute("href", /^\/en\/m\/TR\/c\//);
    await expect
      .poll(() =>
        page.evaluate((id) => {
          return JSON.parse(
            localStorage.getItem(`recently-viewed:${id}`) ?? "[]",
          );
        }, market.id),
      )
      .toContain("seed-style-v2-women-tee");
    expect(
      (await context.cookies()).find((c) => c.name === "market")?.value,
    ).toBe("TR");
  } finally {
    await db.cartItem.deleteMany({ where: { cartId: cart.id } });
    await db.cart.delete({ where: { id: cart.id } });
  }
});

// Phase 01a §1: "cookie persistence (market, NEXT_LOCALE)". A first visit
// with no market cookie should get one set by the middleware, defaulted per
// locale (fa -> IR). Kept separate from tests/e2e/markets.spec.ts, which
// pins the cookie explicitly to test the enabledLocales gate deterministically.
test("middleware sets a market cookie on the first storefront visit", async ({
  page,
  context,
}) => {
  await ensureMaintenanceOff(page.request);
  await context.clearCookies();
  await page.goto("/fa");

  const marketCookie = (await context.cookies()).find(
    (c) => c.name === "market",
  );
  expect(marketCookie?.value).toBe("IR");
});
