import { randomUUID, createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { customerLogin } from "./helpers/crm-customer";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { returnFixture } from "../helpers/returns";
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
      expect(
        await tee
          .locator("select")
          .evaluate((select) => parseFloat(getComputedStyle(select).fontSize)),
      ).toBeGreaterThanOrEqual(16);
      expect(
        await tee
          .locator("select")
          .evaluate((select) => select.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
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
      const cart = await db.cart.findFirstOrThrow({
        where: { customerId: customer.id },
        include: { market: true },
        orderBy: { createdAt: "desc" },
      });
      await expect(
        page.locator(".shop-cart-item-body a").first(),
      ).toHaveAttribute(
        "href",
        new RegExp(`^/${locale}/m/${cart.market.code}/p/`),
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
      const checkoutProduct = page.locator(".shop-checkout-piece a").first();
      await expect(checkoutProduct).toHaveAttribute(
        "href",
        new RegExp(`^/${locale}/m/${cart.market.code}/p/`),
      );
      // Simulate another tab switching the cookie while this checkout stays open.
      await page.evaluate(() => {
        document.cookie = "market=CA; path=/";
      });
      try {
        await checkoutProduct.click();
        await expect(page).toHaveURL(
          new RegExp(`/${locale}/m/${cart.market.code}/p/`),
        );
        await expect(page.locator(".shop-product-title")).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(() =>
              document.cookie.split("; ").find((c) => c.startsWith("market=")),
            ),
          )
          .toBe(`market=${cart.market.code}`);
      } finally {
        await page.evaluate((code) => {
          document.cookie = `market=${code}; path=/`;
        }, cart.market.code);
      }
      const searchProduct = await db.product.findUniqueOrThrow({
        where: { id: "seed-style-v2-women-tee" },
      });
      await page.goto(
        `/${locale}/search?q=${encodeURIComponent(searchProduct.searchText.trim().slice(0, 30))}`,
      );
      const suggestion = page
        .getByTestId("search-suggestions")
        .locator("a")
        .first();
      await expect(suggestion).toBeVisible();
      await expect(suggestion).toHaveAttribute(
        "href",
        new RegExp(`^/${locale}/m/${cart.market.code}/p/`),
      );
      await page.evaluate(() => {
        document.cookie = "market=CA; path=/";
      });
      try {
        await suggestion.click();
        await expect(page).toHaveURL(
          new RegExp(`/${locale}/m/${cart.market.code}/p/`),
        );
        await expect(page.locator(".shop-product-title")).toBeVisible();
      } finally {
        await page.evaluate((code) => {
          document.cookie = `market=${code}; path=/`;
        }, cart.market.code);
      }
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
test("shop repurchase and wardrobe styling keep separate cart intent for the same owned variant", async ({
  page,
}) => {
  test.setTimeout(120000);
  const old = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  await db.integration.update({
    where: { id: old.id },
    data: {
      isActive: true,
      config: { ...(old.config as Record<string, unknown>), enabled: true },
    },
  });
  let productId: string | undefined;
  try {
    const email = `fit-repurchase-${randomUUID()}@example.com`;
    await customerLogin(page, email, "en");
    const customer = await db.customer.findUniqueOrThrow({ where: { email } });
    const f = await returnFixture(db, { customerId: customer.id, code: "CA" });
    productId = f.variants[0].productId;
    await db.product.update({
      where: { id: productId },
      data: { fittingSlot: "TOP", marketIds: [f.market.id] },
    });
    await db.productMedia.create({
      data: { productId, mediaId: "seed-fashion-v2-women-tee" },
    });
    await page.goto("/en/fitting-room");
    const room = page.getByTestId("fitting-room");
    const card = room
      .locator(".fitting-product")
      .filter({ has: page.locator(`option[value="${f.variants[0].id}"]`) });
    await card.locator("select").selectOption(f.variants[0].id);
    await expect(room.locator(".fitting-chip")).toHaveCount(1);
    await expect(room.locator(".fitting-chip")).not.toContainText(
      en.fitting.owned,
    );
    await room.locator(".fitting-add").click();
    await expect(
      room.locator(".fitting-selection [role=status]"),
    ).toContainText(en.fitting.added);
    const cart = await db.cart.findFirstOrThrow({
      where: { customerId: customer.id, completedAt: null, order: null },
      orderBy: { createdAt: "desc" },
    });
    expect(
      (
        await db.cartItem.findUniqueOrThrow({
          where: {
            cartId_variantId: { cartId: cart.id, variantId: f.variants[0].id },
          },
        })
      ).quantity,
    ).toBe(1);
    await room.locator(".fitting-source button").nth(1).click();
    await card.locator("select").selectOption(f.variants[0].id);
    await expect(room.locator(".fitting-chip")).toContainText(en.fitting.owned);
    await expect(room.locator(".fitting-add")).toHaveCount(0);
    const trousersId = "seed-style-v2-women-trousers-m";
    const recoveryKey = `hoda:fitting:${customer.id}:${f.market.id}`;
    const restore = async (variantId: string) => {
      await page.evaluate(
        ({ key, variantId }) =>
          sessionStorage.setItem(
            key,
            JSON.stringify({
              modelId: "woman",
              selection: [variantId],
              wardrobeSelection: [variantId],
            }),
          ),
        { key: recoveryKey, variantId },
      );
      await page.reload();
    };
    // A stale wardrobe reference must not silently become a shop purchase.
    await restore(trousersId);
    await expect(room.locator(".fitting-chip")).toHaveCount(0);
    await expect(room.locator(".fitting-generate")).toBeDisabled();
    await expect(room.locator(".fitting-add")).toHaveCount(0);
    await restore(f.variants[0].id);
    await expect(room.locator(".fitting-chip")).toContainText(en.fitting.owned);
    await expect(room.locator(".fitting-add")).toHaveCount(0);
    await room
      .locator(".fitting-product")
      .filter({ has: page.locator(`option[value="${trousersId}"]`) })
      .locator("select")
      .selectOption(trousersId);
    await room.locator(".fitting-add").click();
    await expect(
      room.locator(".fitting-selection [role=status]"),
    ).toContainText(en.fitting.added);
    const items = await db.cartItem.findMany({ where: { cartId: cart.id } });
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.variantId === f.variants[0].id)?.quantity).toBe(
      1,
    );
    expect(items.find((i) => i.variantId === trousersId)?.quantity).toBe(1);
  } finally {
    if (productId)
      await db.product.update({
        where: { id: productId },
        data: { status: "ARCHIVED" },
      });
    await db.integration.update({
      where: { id: old.id },
      data: { isActive: old.isActive, config: old.config! },
    });
  }
});
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

test("pending fitting requests survive market changes without leaking selection or losing recovery", async ({
  page,
}) => {
  test.setTimeout(120000);
  const old = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  const config = old.config as Record<string, unknown>;
  const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  const other = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
  const email = `fit-persistence-${randomUUID()}@example.com`;
  await db.integration.update({
    where: { id: old.id },
    data: { isActive: true, config: { ...config, enabled: true } },
  });
  try {
    await customerLogin(page, email, "en");
    const customer = await db.customer.findUniqueOrThrow({ where: { email } });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en/fitting-room");
    const room = page.getByTestId("fitting-room");
    await expect(room).toBeVisible();
    const switcher = page.getByRole("combobox", {
      name: en.market.chooseMarket,
      exact: true,
    });
    const firstKey = `hoda:fitting:${customer.id}:${market.id}`;
    const secondKey = `hoda:fitting:${customer.id}:${other.id}`;
    const request = {
      requestKey: randomUUID(),
      modelId: "woman",
      variantIds: ["seed-style-v2-women-tee-m"],
      expectedCostCoins: "12.5",
      confirm: true,
    };
    const record = JSON.stringify({
      request,
      modelId: "woman",
      selection: request.variantIds,
    });
    await page.evaluate(
      ({ firstKey, secondKey, record }) => {
        sessionStorage.setItem(firstKey, record);
        sessionStorage.setItem(
          secondKey,
          JSON.stringify({
            modelId: "woman",
            selection: ["not-a-current-product"],
          }),
        );
      },
      { firstKey, secondKey, record },
    );
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      switcher.selectOption("TR"),
    ]);
    await expect(switcher).toHaveValue("TR");
    await expect(room.locator(".fitting-chip")).toHaveCount(1);
    await expect(room.locator(".fitting-generate")).toContainText(
      en.fitting.retry,
    );
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      switcher.selectOption("CA"),
    ]);
    await expect(switcher).toHaveValue("CA");
    await expect(room).toBeVisible();
    await expect(room.locator(".fitting-chip")).toHaveCount(0);
    await expect(room.locator(".fitting-generate")).not.toContainText(
      en.fitting.retry,
    );
    expect(
      await page.evaluate((key) => sessionStorage.getItem(key), firstKey),
    ).toBe(record);
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      switcher.selectOption("TR"),
    ]);
    await expect(switcher).toHaveValue("TR");
    await expect(room.locator(".fitting-chip")).toHaveCount(1);
    await expect(room.locator(".fitting-generate")).toContainText(
      en.fitting.retry,
    );
    expect(
      await db.fittingSession.count({ where: { customerId: customer.id } }),
    ).toBe(0);
    expect(
      await page.evaluate((key) => sessionStorage.getItem(key), firstKey),
    ).toBe(record);
    // A committed response can be lost before the feature is switched off.
    // The durable fixture holds the real charge and fingerprint; no provider is dispatched.
    const grant = await db.fittingCoinGrant.create({
      data: {
        customerId: customer.id,
        sourceKey: `browser-recovery:${request.requestKey}`,
        reason: "MANUAL",
        amount: "100",
        balance: "87.5",
      },
    });
    const session = await db.fittingSession.create({
      data: {
        customerId: customer.id,
        marketId: market.id,
        requestKey: request.requestKey,
        modelId: request.modelId,
        fingerprint: createHash("sha256")
          .update(
            JSON.stringify({
              modelId: request.modelId,
              variantIds: request.variantIds,
              marketId: market.id,
              expectedCostCoins: request.expectedCostCoins,
            }),
          )
          .digest("hex"),
        costCoins: "12.5",
        allocations: [{ grantId: grant.id, amount: "12.5" }],
        snapshot: {
          model: {
            kind: "WOMAN",
            image: {
              storageKey: "media/browser-recovery.webp",
              mime: "image/webp",
            },
          },
          items: [
            {
              variantId: request.variantIds[0],
              productId: "seed-style-v2-women-tee",
              title: "Fixture",
              color: "Ivory",
              hex: "#ffffff",
              size: "M",
              owned: false,
              image: {
                storageKey: "media/browser-recovery.webp",
                mime: "image/webp",
              },
            },
          ],
          provider: "openai",
          modelName: "gpt-image-1.5",
          quality: "medium",
        },
      },
    });
    await db.fittingCoinEntry.createMany({
      data: [
        {
          customerId: customer.id,
          sourceKey: `grant:${grant.sourceKey}`,
          reason: "MANUAL",
          amount: "100",
        },
        {
          customerId: customer.id,
          sourceKey: `spend:${session.id}`,
          reason: "FITTING",
          amount: "-12.5",
        },
      ],
    });
    await db.integration.update({
      where: { id: old.id },
      data: { isActive: false, config: { ...config, enabled: false } },
    });
    await page.reload();
    await expect(room).toBeVisible();
    await expect(
      room.getByRole("status").filter({ hasText: en.fitting.disabled }),
    ).toBeVisible();
    const retry = room.locator(".fitting-generate");
    await expect(retry).toContainText(en.fitting.retry);
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(room.locator(".fitting-status")).toContainText(
      en.fitting.status_QUEUED,
    );
    await expect(retry).toBeDisabled();
    await expect
      .poll(async () =>
        JSON.parse(
          (await page.evaluate(
            (key) => sessionStorage.getItem(key),
            firstKey,
          ))!,
        ),
      )
      .toMatchObject({ sessionId: session.id });
    await page.reload();
    await expect(room.locator(".fitting-status")).toContainText(
      en.fitting.status_QUEUED,
    );
    expect(
      await db.fittingSession.count({ where: { customerId: customer.id } }),
    ).toBe(1);
    expect(
      await db.fittingCoinEntry.count({
        where: { customerId: customer.id, reason: "FITTING" },
      }),
    ).toBe(1);
    expect(
      (
        await db.fittingCoinGrant.findUniqueOrThrow({ where: { id: grant.id } })
      ).balance.toString(),
    ).toBe("87.5");
  } finally {
    await db.integration.update({
      where: { id: old.id },
      data: { isActive: old.isActive, config: old.config! },
    });
  }
});

test("fitting recipient search hides scoped-denied customers even with a forged market URL", async ({
  page,
}) => {
  test.setTimeout(120000);
  const owner = await db.user.findUniqueOrThrow({
    where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
  });
  const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  const other = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
  const marker = `fit-scope-${randomUUID()}`;
  const allowed = await db.customer.create({
    data: {
      email: `${marker}-tr@example.com`,
      preferredMarketId: market.id,
      isGuest: false,
    },
  });
  const denied = await db.customer.create({
    data: {
      email: `${marker}-ca@example.com`,
      preferredMarketId: other.id,
      isGuest: false,
    },
  });
  const override = await db.userPermissionOverride.create({
    data: {
      userId: owner.id,
      permission: "crm.customer.view",
      allow: false,
      scope: { marketId: other.id },
    },
  });
  try {
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
    await page.goto(
      `/admin/settings/fitting?marketId=${market.id}&q=${marker}`,
    );
    const recipients = page.locator("select[multiple]");
    await expect(
      recipients.locator(`option[value="${allowed.id}"]`),
    ).toContainText(allowed.email);
    await expect(
      recipients.locator(`option[value="${denied.id}"]`),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(denied.email);
    await expect(
      page.locator(`select[name=marketId] option[value="${other.id}"]`),
    ).toHaveCount(0);
    await page.goto(`/admin/settings/fitting?marketId=${other.id}&q=${marker}`);
    await expect(recipients.locator("option")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(denied.email);
    await expect(
      page.getByRole("button", { name: fa.fitting.grant, exact: true }),
    ).toBeDisabled();
  } finally {
    await db.userPermissionOverride.delete({ where: { id: override.id } });
    await db.customer.deleteMany({
      where: { id: { in: [allowed.id, denied.id] } },
    });
  }
});

test("saving settings after a lost manual-grant response preserves the original grant key", async ({
  page,
}) => {
  test.setTimeout(150000);
  const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  const old = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  const marker = `fit-grant-retry-${randomUUID()}`;
  const customer = await db.customer.create({
    data: {
      email: `${marker}@example.com`,
      preferredMarketId: market.id,
      isGuest: false,
    },
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
  let lost = false;
  try {
    await page.goto(
      `/admin/settings/fitting?marketId=${market.id}&q=${marker}`,
    );
    await page.locator("select[multiple]").selectOption([customer.id]);
    await page.getByLabel(fa.fitting.grantAmount, { exact: true }).fill("12.5");
    await page
      .getByLabel(fa.fitting.grantReason, { exact: true })
      .fill("retry fixture");
    await page.getByLabel(fa.fitting.confirmAdmin, { exact: true }).check();
    await page.route("**/admin/settings/fitting**", async (route) => {
      if (!lost && route.request().method() === "POST") {
        lost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: fa.fitting.grant, exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      fa.fitting.requestUnknown,
    );
    await expect
      .poll(() =>
        db.fittingCoinGrant.count({
          where: { customerId: customer.id, reason: "MANUAL" },
        }),
      )
      .toBe(1);
    const first = await db.fittingCoinGrant.findFirstOrThrow({
      where: { customerId: customer.id, reason: "MANUAL" },
    });
    await page.getByLabel(fa.fitting.costCoins, { exact: true }).fill("13.5");
    await page.getByLabel(fa.fitting.confirmAdmin, { exact: true }).check();
    await page
      .getByRole("button", { name: fa.fitting.saveSettings, exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(fa.fitting.saved);
    await expect(page.locator("[data-config-version]")).not.toHaveAttribute(
      "data-config-version",
      old.updatedAt.toISOString(),
    );
    await expect(page.locator("select[multiple]")).toHaveValues([customer.id]);
    await page.getByLabel(fa.fitting.confirmAdmin, { exact: true }).check();
    await page
      .getByRole("button", { name: fa.fitting.grant, exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(fa.fitting.saved);
    const grants = await db.fittingCoinGrant.findMany({
      where: { customerId: customer.id, reason: "MANUAL" },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0].sourceKey).toBe(first.sourceKey);
    expect(grants[0].amount.toString()).toBe("12.5");
    expect(
      await db.fittingCoinEntry.count({
        where: { customerId: customer.id, reason: "MANUAL" },
      }),
    ).toBe(1);
  } finally {
    try {
      if (!page.isClosed()) await page.unroute("**/admin/settings/fitting**");
    } finally {
      await db.integration.update({
        where: { id: old.id },
        data: { isActive: old.isActive, config: old.config! },
      });
    }
  }
});
test("public coin-pack links disappear immediately when either sale toggle is disabled", async ({
  page,
}) => {
  test.setTimeout(120000);
  const original = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  const pack = await db.product.findUniqueOrThrow({
    where: { id: "seed-fitting-pack-100" },
  });
  const slug = (pack.slugI18n as Record<string, string>).en;
  const set = async (enabled: boolean, coinSalesEnabled: boolean) =>
    db.integration.update({
      where: { id: original.id },
      data: {
        isActive: enabled,
        config: {
          ...(original.config as Record<string, unknown>),
          enabled,
          coinSalesEnabled,
        },
      },
    });
  try {
    await db.product.update({
      where: { id: pack.id },
      data: { status: "ACTIVE" },
    });
    await set(true, true);
    await page.goto(`/en/m/TR/p/${slug}`);
    await expect(page.locator(".shop-product-title")).toBeVisible();
    const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
    const suggest = async () =>
      (await (
        await page.request.get(
          `/api/catalog/suggest?market=${market.id}&q=coins`,
        )
      ).json()) as { items: { id: string }[] };
    expect((await suggest()).items.some((p) => p.id === pack.id)).toBe(true);
    for (const [enabled, sales] of [
      [true, false],
      [false, true],
    ]) {
      await set(enabled, sales);
      expect((await page.goto(`/en/p/${slug}`))?.status()).toBe(404);
      expect((await page.goto(`/en/p/${slug}?preview=1`))?.status()).toBe(404);
      await page.goto("/en/search?q=coins");
      await expect(page.locator(`a[href$="/p/${slug}"]`)).toHaveCount(0);
      expect((await suggest()).items.some((p) => p.id === pack.id)).toBe(false);
    }
  } finally {
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
