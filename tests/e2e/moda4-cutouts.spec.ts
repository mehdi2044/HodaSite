import { test, expect } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { storage } from "../../src/modules/integrations/storage";
import { fillAdminMfa } from "./helpers/admin-mfa";
import en from "../../messages/en.json";
const db = new PrismaClient();
test.use({ viewport: { width: 390, height: 844 }, actionTimeout: 15000 });
test("cutout geometry: real panel/preview/keyboard/save/reload and inherited Kids catalog fallback", async ({
  page,
  context,
}, info) => {
  test.setTimeout(150000);
  const root = await db.category.findUniqueOrThrow({
    where: { id: "seed-category-kids" },
  });
  const product = await db.product.findFirstOrThrow({
    where: {
      gender: "KIDS",
      status: "ACTIVE",
      deletedAt: null,
      coinPackCoins: null,
      fittingSlot: "TOP",
    },
    include: {
      variants: {
        where: { isActive: true },
        include: { color: true, size: true },
      },
    },
  });
  const variant = product.variants[0],
    colorId = variant.colorId;
  const id = `r4-browser-${randomUUID()}`,
    key = `media/2026/10/${id}.png`;
  const rectangle = await sharp({
    create: {
      width: 40,
      height: 50,
      channels: 4,
      background: { r: 100, g: 170, b: 145, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: {
      width: 80,
      height: 100,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: rectangle, left: 20, top: 25 }])
    .png()
    .toBuffer();
  const url = await storage.put(key, bytes, "image/png");
  await db.media.create({
    data: {
      id,
      storageKey: key,
      url,
      originalName: "r4-synthetic-cutout-proof.png",
      mime: "image/png",
      kind: "image",
      width: 80,
      height: 100,
      bytes: bytes.length,
    },
  });
  let profileId: string | undefined;
  const catalog = await context.newPage();
  try {
    const guest = await page.request.post("/api/admin/cutouts/preview", {
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
    await context.addCookies([
      {
        name: "hoda.admin.locale",
        value: "en",
        url: info.project.use.baseURL!,
      },
    ]);
    await catalog.goto(
      `/en/m/CA/c/${encodeURIComponent((root.slugI18n as Record<string, string>).en)}`,
    );
    await page.goto(
      `/admin/catalog/cutouts?product=${product.id}&color=${colorId}`,
    );
    const form = page
      .locator("form")
      .filter({ has: page.locator('input[name="payload"]') });
    await form.getByRole("button", { name: en.media.chooseMedia }).click();
    const dialog = form.locator("dialog");
    await dialog
      .locator("input[type=search]")
      .fill("r4-synthetic-cutout-proof");
    await dialog.getByTestId(`media-picker-item-${id}`).click();
    await page
      .getByRole("button", { name: en.cutouts.addModel, exact: true })
      .click();
    const handle = page.getByTestId("cutout-layer");
    await expect(handle).toBeVisible();
    await handle.focus();
    await handle.press("ArrowRight");
    await expect(
      page.getByLabel(en.cutouts.fields.x, { exact: true }),
    ).toHaveValue("0.51");
    const handleBox = await handle.boundingBox();
    expect(handleBox).toBeTruthy();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + 16,
      handleBox!.y + handleBox!.height / 2,
      { steps: 3 },
    );
    await page.mouse.up();
    await expect(
      page.getByLabel(en.cutouts.fields.x, { exact: true }),
    ).not.toHaveValue("0.51");

    for (const [modelId, y] of [
      ["woman", "0.41"],
      ["man", "0.43"],
      ["girl", "0.36"],
      ["boy", "0.38"],
    ] as const) {
      await page
        .getByRole("combobox", { name: en.cutouts.model, exact: true })
        .selectOption(modelId);
      const add = page.getByRole("button", {
        name: en.cutouts.addModel,
        exact: true,
      });
      if (await add.count()) await add.click();
      await page.getByLabel(en.cutouts.fields.y, { exact: true }).fill(y);
      await expect(page.getByTestId("cutout-visual")).toBeVisible();
    }
    await page.getByLabel(en.cutouts.confirm, { exact: true }).check();
    await expect(
      form.getByRole("button", { name: en.cutouts.save, exact: true }),
    ).toBeEnabled();
    await form
      .getByRole("button", { name: en.cutouts.save, exact: true })
      .click();
    await expect(form.locator(":scope > [role=status]")).toBeVisible();
    const row = await db.catalogCutout.findFirstOrThrow({
      where: { productId: product.id, colorId, variantId: null },
    });
    profileId = row.id;
    expect((row.geometry as { models: unknown[] }).models).toHaveLength(4);
    await page.reload();
    await page
      .getByRole("combobox", { name: en.cutouts.model, exact: true })
      .selectOption("girl");
    await expect(
      page.getByLabel(en.cutouts.fields.y, { exact: true }),
    ).toHaveValue("0.36");
    await expect(page.getByTestId("cutout-visual")).toBeVisible();
    await page.screenshot({
      path: info.outputPath("r4-admin-390.png"),
      scale: "css",
    });
    await page.goto("/admin/catalog/presentation");
    const categoryForm = page
      .locator("form")
      .filter({ has: page.locator(`input[name="id"][value="${root.id}"]`) });
    await categoryForm
      .getByRole("combobox", { name: en.cutouts.categoryStyle, exact: true })
      .selectOption("kids");
    await categoryForm
      .getByRole("combobox", { name: en.cutouts.tone, exact: true })
      .selectOption("kidsSky");
    await categoryForm
      .getByRole("button", { name: en.cutouts.saveCategory, exact: true })
      .click();
    await expect(categoryForm.locator(":scope > [role=status]")).toBeVisible();
    await page.reload();
    await expect(categoryForm.locator('[name="presentationKind"]')).toHaveValue(
      "kids",
    );
    if (process.env.HODASITE_PREVIEW === "1") {
      await catalog.bringToFront();
      await expect(catalog.locator("main.kids-category")).toHaveAttribute(
        "data-kids-tone",
        "kidsSky",
        { timeout: 5000 },
      );
    }

    await context.addCookies([
      { name: "market", value: "CA", url: info.project.use.baseURL! },
    ]);
    const slug = (root.slugI18n as Record<string, string>).en;
    await page.goto(`/en/m/CA/c/${encodeURIComponent(slug)}`);
    await expect(page.locator("main.kids-category")).toHaveAttribute(
      "data-kids-tone",
      "kidsSky",
    );
    const cards = page.locator(".kids-motion-card");
    await expect(cards.first()).toBeVisible();
    await expect(page.getByText(en.cutouts.cardFallback).first()).toBeVisible();
    const first = cards.first();
    const angleControls = first.locator("summary");
    await expect(angleControls).toHaveAttribute(
      "aria-label",
      en.cutouts.angleControls,
    );
    await angleControls.click();
    await expect(
      first.getByRole("button", { name: en.cutouts.angleRight, exact: true }),
    ).toBeVisible();
    await first
      .getByRole("button", { name: en.cutouts.angleRight, exact: true })
      .click();
    expect(
      await first.evaluate((element) =>
        element.style.getPropertyValue("--kids-angle"),
      ),
    ).toBe("10deg");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await first
      .getByRole("button", { name: en.cutouts.startMotion, exact: true })
      .click();
    await expect(
      first.getByRole("button", { name: en.cutouts.pauseMotion, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("r4-kids-en-390.png"),
      scale: "css",
    });
    for (const [locale, marketCode] of [
      ["fa", "IR"],
      ["tr", "TR"],
    ] as const) {
      await context.addCookies([
        { name: "market", value: marketCode, url: info.project.use.baseURL! },
      ]);
      const localizedSlug = (root.slugI18n as Record<string, string>)[locale];
      await page.goto(
        `/${locale}/m/${marketCode}/c/${encodeURIComponent(localizedSlug)}`,
      );
      await expect(page.locator("main.kids-category")).toHaveAttribute(
        "data-kids-tone",
        "kidsSky",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`r4-kids-${locale}-390.png`),
        scale: "css",
      });
    }
  } finally {
    await catalog.close();
    await db.category.update({
      where: { id: root.id },
      data: {
        presentation:
          root.presentation === null
            ? Prisma.DbNull
            : (root.presentation as Prisma.InputJsonValue),
      },
    });
    if (profileId)
      await db.catalogCutout.deleteMany({ where: { id: profileId } });
    await db.media.update({ where: { id }, data: { deletedAt: new Date() } });
    await storage.delete(key);
    await db.$disconnect();
  }
});
