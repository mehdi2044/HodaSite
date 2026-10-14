import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import en from "../../messages/en.json";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { tokenHash } from "../../src/lib/secure-tokens";
const db = new PrismaClient();
test.use({ actionTimeout: 15000, viewport: { width: 390, height: 844 } });

test("real PHOTO editor: private draft, publication, live price, exact sizes and atomic cart", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(180000);
  const market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
  const previous = await db.homepage.findUnique({
    where: { marketId: market.id },
  });
  const products = await db.product.findMany({
    where: {
      id: { in: ["seed-style-v2-women-coat", "seed-style-v2-women-tee"] },
    },
    include: { media: true, variants: { include: { media: true } } },
    orderBy: { id: "asc" },
  });
  const image = await db.media.findUniqueOrThrow({
    where: { id: "seed-fashion-v2-look-women-coat" },
  });
  const observations: Record<string, unknown> = {
    viewport: { width: 390, height: 844 },
    previewEnabled: process.env.HODASITE_PREVIEW === "1",
  };
  const shop = await context.newPage();
  try {
    await db.market.update({
      where: { id: market.id },
      data: { enabledLocales: ["fa", "tr", "en"] },
    });
    await context.addCookies([
      { name: "market", value: "CA", url: info.project.use.baseURL! },
    ]);
    await shop.goto("/en/m/CA");
    const guest = await shop.request.post("/api/admin/scenes/preview", {
      data: {},
    });
    expect(guest.status()).toBe(401);
    expect(guest.headers()["cache-control"]).toContain("no-store");
    await page.goto("/admin/login");
    await page
      .getByLabel("ایمیل")
      .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
    await page
      .getByLabel("رمز عبور")
      .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
    await fillAdminMfa(page);
    await page.getByRole("button", { name: "ورود امن" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    // Open the actual operator preview after authentication, before editing.
    // Anonymous pages intentionally have no private revision-polling endpoint.
    await shop.goto("/en/m/CA");
    if (process.env.HODASITE_PREVIEW === "1")
      await expect(shop.locator("[data-preview-revision]")).toBeVisible();

    await context.addCookies([
      {
        name: "hoda.admin.locale",
        value: "en",
        url: info.project.use.baseURL!,
      },
    ]);
    await page.goto(`/admin/content/homepage/scenes?scope=${market.id}`);
    await page.getByLabel(en.scenes.enableScene, { exact: true }).check();
    const titles = {
      fa: "صحنهٔ واقعی مرورگر",
      tr: "Gerçek sahne testi",
      en: "Real browser scene",
    };
    for (const locale of ["fa", "tr", "en"] as const) {
      await page
        .getByLabel(
          `${en.scenes.title} — ${{ fa: "فارسی", tr: "Türkçe", en: "English" }[locale]}`,
          { exact: true },
        )
        .fill(titles[locale]);
      await page
        .getByLabel(
          `${en.scenes.alt} — ${{ fa: "فارسی", tr: "Türkçe", en: "English" }[locale]}`,
          { exact: true },
        )
        .fill(titles[locale]);
    }
    for (const kind of ["desktop", "mobile"] as const) {
      const frame = page
        .locator(".card")
        .filter({ has: page.locator(`input[name="${kind}SceneMedia"]`) });
      await frame.getByRole("button", { name: en.media.chooseMedia }).click();
      const dialog = frame.locator("dialog");
      await dialog.locator("input[type=search]").fill(image.originalName);
      await dialog.getByTestId(`media-picker-item-${image.id}`).click();
      await expect(
        frame.locator(`input[name="${kind}SceneMedia"]`),
      ).toHaveValue(image.id);
    }
    for (const [index, product] of products.entries()) {
      await page
        .getByRole("button", { name: en.scenes.addPiece, exact: true })
        .click();
      const piece = page.getByTestId(`scene-editor-piece-${index}`);
      await piece
        .getByRole("combobox", { name: en.scenes.product, exact: true })
        .selectOption(product.id);
      const variant =
        product.variants.find((v) => v.media.length) ?? product.variants[0];
      await piece
        .getByRole("combobox", { name: en.scenes.color, exact: true })
        .selectOption(variant.colorId);
      const reference = (variant.media[0] ?? product.media[0]).mediaId;
      await piece
        .getByRole("combobox", { name: en.scenes.referenceImage, exact: true })
        .selectOption(reference);
      for (const kind of ["desktop", "mobile"] as const) {
        await piece
          .getByLabel(`${en.scenes[kind]} X`, { exact: true })
          .fill(index === 0 ? "0.62" : "0.47");
        await piece
          .getByLabel(`${en.scenes[kind]} Y`, { exact: true })
          .fill(index === 0 ? "0.51" : "0.24");
      }
    }
    const preview = page.getByTestId("scene-preview").contentFrame();
    await page
      .getByRole("combobox", { name: en.scenes.previewLanguage, exact: true })
      .selectOption("en");
    await expect(
      preview.getByRole("heading", { name: titles.en }),
    ).toBeVisible();
    await expect(preview.locator(".scene-price-list article")).toHaveCount(2);
    await expect(
      preview.getByRole("button", { name: en.scenes.addScene }),
    ).toBeDisabled();
    const previewStatus = await page.request.get("/api/admin/preview-status");
    if (previewStatus.ok())
      observations.application = await previewStatus.json();
    const draftForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="blocks"]') });
    const unsaved = JSON.parse(
      await draftForm.locator('input[name="blocks"]').inputValue(),
    ).find(
      (block: { scene?: { title?: { en?: string } } }) =>
        block.scene?.title?.en === titles.en,
    ).scene;
    await page.evaluate((scene) => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        '[data-testid="scene-preview"]',
      );
      iframe?.contentWindow?.postMessage(
        {
          type: "scene-preview",
          channel: "invalid-channel",
          scene: {
            ...scene,
            title: { ...scene.title, en: "Rejected preview channel" },
          },
        },
        location.origin,
      );
    }, unsaved);
    const readonly = await page.request.post("/api/admin/scenes/preview", {
      data: {
        scopeMarketId: market.id,
        marketId: market.id,
        locale: "en",
        scene: unsaved,
      },
    });
    expect(readonly.status()).toBe(200);
    expect(readonly.headers()["cache-control"]).toContain("private, no-store");
    await expect(
      preview.getByRole("heading", { name: "Rejected preview channel" }),
    ).toHaveCount(0);
    await page.getByLabel(en.scenes.confirmMatch, { exact: true }).check();
    await draftForm
      .getByRole("button", { name: en.scenes.saveDraft, exact: true })
      .click();
    await expect(draftForm.locator(":scope > [role=status]")).toBeVisible();
    const saved = await db.homepage.findUniqueOrThrow({
      where: { marketId: market.id },
    });
    expect(JSON.stringify(saved.draftBlocks)).toContain("fingerprint");
    await expect(shop.getByRole("heading", { name: titles.en })).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByLabel(`${en.scenes.title} — English`, { exact: true }),
    ).toHaveValue(titles.en);
    const publishStarted = Date.now();
    await page
      .getByRole("button", { name: en.scenes.publishRevision, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.homepage.findUniqueOrThrow({ where: { id: saved.id } }))
            .publishedRevisionId,
      )
      .toBe(saved.draftRevisionId);
    if (process.env.HODASITE_PREVIEW !== "1") await shop.reload();
    await shop.bringToFront();
    await expect(shop.getByRole("heading", { name: titles.en })).toBeVisible({
      timeout: 15000,
    });
    observations.publishToOpenStoreMs = Date.now() - publishStarted;
    if (process.env.HODASITE_PREVIEW === "1")
      expect(observations.publishToOpenStoreMs as number).toBeLessThanOrEqual(
        5000,
      );
    const scene = shop.locator(`[data-scene-id="${unsaved.id}"]`);
    await expect(scene.locator(".scene-price-list article")).toHaveCount(2);
    await expect(
      scene.getByRole("button", { name: en.scenes.addScene }),
    ).toBeDisabled();
    const priceStarted = Date.now();
    const beforePrice = await scene
      .locator(".scene-price-list strong")
      .first()
      .textContent();
    await db.product.update({
      where: { id: products[0].id },
      data: { basePriceAmount: products[0].basePriceAmount.plus(100) },
    });
    await expect
      .poll(
        () => scene.locator(".scene-price-list strong").first().textContent(),
        { timeout: 15000, intervals: [100] },
      )
      .not.toBe(beforePrice);
    observations.priceToOpenStoreMs = Date.now() - priceStarted;
    expect(observations.priceToOpenStoreMs as number).toBeLessThanOrEqual(5000);
    // The readonly preview uses the same live resolver and refreshes open forms.
    await page
      .getByRole("combobox", { name: en.scenes.previewLanguage, exact: true })
      .selectOption("en");
    await expect(preview.locator(".scene-price-list article")).toHaveCount(2);
    for (const select of await scene
      .locator('select[name="variantId"]')
      .all()) {
      const options = select.locator("option:not([disabled])");
      const value = await options.nth(1).getAttribute("value");
      expect(value).toBeTruthy();
      await select.selectOption(value!);
    }
    await expect(
      scene.getByRole("button", { name: en.scenes.addScene }),
    ).toBeEnabled();
    await scene.getByRole("button", { name: en.scenes.addScene }).click();
    await expect
      .poll(async () =>
        (await context.cookies()).some((c) => c.name === "hoda.cart"),
      )
      .toBe(true);
    const cookie = (await context.cookies()).find(
      (c) => c.name === "hoda.cart",
    );
    expect(cookie).toBeTruthy();
    await expect
      .poll(
        async () =>
          (
            await db.cart.findUniqueOrThrow({
              where: { tokenHash: tokenHash(cookie!.value) },
              include: { items: true },
            })
          ).items.length,
      )
      .toBe(2);
    for (const locale of ["fa", "tr", "en"] as const) {
      await shop.goto(`/${locale}/m/CA`);
      await expect(
        shop.getByRole("heading", { name: titles[locale] }),
      ).toBeVisible();
      expect(
        await shop.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await shop.screenshot({
        path: info.outputPath(`r3-scene-${locale}-390.png`),
        scale: "css",
      });
      await scene.screenshot({
        path: info.outputPath(`r3-scene-${locale}-390-full.png`),
        scale: "css",
      });
    }
    await shop.setViewportSize({ width: 1440, height: 1000 });
    await shop.goto("/en/m/CA");
    await expect(shop.getByRole("heading", { name: titles.en })).toBeVisible();
    await shop.screenshot({ path: info.outputPath("r3-scene-en-1440.png") });
    await page.bringToFront();
    await page
      .getByLabel(`${en.scenes.title} — English`, { exact: true })
      .fill("Next revision proof");
    await draftForm
      .getByRole("button", { name: en.scenes.saveDraft, exact: true })
      .click();
    await expect(draftForm.locator(":scope > [role=status]")).toBeVisible();
    const next = await db.homepage.findUniqueOrThrow({
      where: { id: saved.id },
    });
    await page
      .getByRole("button", { name: en.scenes.publishRevision, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.homepage.findUniqueOrThrow({ where: { id: saved.id } }))
            .publishedRevisionId,
      )
      .toBe(next.draftRevisionId);
    await page
      .getByRole("combobox", { name: en.scenes.history, exact: true })
      .selectOption(saved.draftRevisionId!);
    await expect(
      page.getByRole("link", { name: en.scenes.previewRevision, exact: true }),
    ).toHaveAttribute("href", new RegExp(saved.draftRevisionId!));
    await page
      .getByRole("link", { name: en.scenes.previewRevision, exact: true })
      .click();
    await expect(
      page.getByLabel(`${en.scenes.title} — English`, { exact: true }),
    ).toHaveValue(titles.en);
    await expect(
      page.getByLabel(`${en.scenes.title} — English`, { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: en.scenes.publishRevision, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.homepage.findUniqueOrThrow({ where: { id: saved.id } }))
            .publishedRevisionId,
      )
      .toBe(saved.draftRevisionId);
    expect(
      (
        await db.cart.findUniqueOrThrow({
          where: { tokenHash: tokenHash(cookie!.value) },
          include: { items: true },
        })
      ).items,
    ).toHaveLength(2);
    await page
      .getByRole("combobox", { name: en.scenes.previewLanguage, exact: true })
      .selectOption("en");
    await expect(
      preview.getByRole("heading", { name: titles.en }),
    ).toBeVisible();
    await preview.locator("main").screenshot({
      path: info.outputPath("r3-private-history-en-390.png"),
      scale: "css",
    });
    await writeFile(
      info.outputPath("observations.json"),
      JSON.stringify(observations, null, 2) + "\n",
    );
    await info.attach("r3-observations", {
      body: Buffer.from(JSON.stringify(observations)),
      contentType: "application/json",
    });
    // A fresh public context cannot serve a previously cached image from the PWA.
    // Scroll the actual lower-page scene into view so its lazy image really loads.
    const failureContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    try {
      const failureShop = await failureContext.newPage();
      await failureShop.route("**/media/**", (route) => route.abort());
      await failureShop.goto(shop.url());
      const failedScene = failureShop.locator(
        `[data-scene-id="${unsaved.id}"]`,
      );
      await failedScene
        .locator('[data-scene-frame="mobile"]')
        .scrollIntoViewIfNeeded();
      await expect(
        failedScene
          .locator('[data-scene-frame="mobile"]')
          .getByText(en.scenes.missingImage),
      ).toBeVisible();
      await expect(
        failedScene.locator(".scene-price-list article"),
      ).toHaveCount(2);
      await expect(
        failedScene.getByRole("button", { name: en.scenes.addScene }),
      ).toBeDisabled();
    } finally {
      await failureContext.close();
    }
  } finally {
    await shop.close();
    for (const product of products)
      await db.product.update({
        where: { id: product.id },
        data: { basePriceAmount: product.basePriceAmount },
      });
    await db.market.update({
      where: { id: market.id },
      data: { enabledLocales: market.enabledLocales },
    });
    if (previous) {
      const { id, createdAt, updatedAt, ...rest } = previous;
      void createdAt;
      void updatedAt;
      await db.homepage.update({
        where: { id },
        data: {
          ...rest,
          blocks: rest.blocks as Prisma.InputJsonValue,
          draftBlocks:
            rest.draftBlocks === null
              ? Prisma.DbNull
              : (rest.draftBlocks as Prisma.InputJsonValue),
        },
      });
    } else await db.homepage.deleteMany({ where: { marketId: market.id } });
    await db.$disconnect();
  }
});
