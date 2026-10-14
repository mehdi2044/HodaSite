import sharp from "sharp";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { shoppingProof } from "./helpers/shopping-proof";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admin catalog lists products and opens the complete editor", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/catalog/products");
  await expect(page.getByRole("heading", { name: "محصولات" })).toBeVisible();
  await expect(page.getByRole("link", { name: "محصول جدید" })).toBeVisible();
  await page.goto("/admin/catalog/products/seed-product-1");
  for (const tab of [
    "عمومی",
    "رسانه",
    "تنوع‌ها",
    "قیمت",
    "راهنمای سایز",
    "SEO",
    "بازارها",
    "انتشار",
  ])
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  await page.getByRole("tab", { name: "تنوع‌ها" }).click();
  await expect(page.getByText("ماتریس رنگ × سایز")).toBeVisible();
});

test("admin taxonomy exposes all six catalog entities", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/admin/catalog/taxonomy");
  for (const heading of [
    "برندها",
    "کالکشن‌ها",
    "رنگ‌ها",
    "سایزها",
    "دسته‌بندی‌ها",
    "راهنمای سایز",
  ])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "ویرایش" }).first().click();
  await expect(page).toHaveURL(/editKind=brand/);
  const editForm = page
    .locator("form")
    .filter({ has: page.locator('input[name="slug"]') })
    .first();
  await expect(editForm.locator('input[name="id"]')).toHaveValue(/seed-brand/);
});

test("category edit preserves its cover and exposes the shared image picker", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await login(page);
  const url =
    "/admin/catalog/taxonomy?editKind=category&editId=seed-category-women";
  await page.goto(url);
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="kind"][value="category"]') });
  const cover = form.locator('input[name="mediaId"]');
  const before = await cover.inputValue();
  expect(before).not.toBe("");
  await expect(
    form.getByText("تصویر دسته‌بندی", { exact: true }),
  ).toBeVisible();
  await form.getByRole("button", { name: "انتخاب رسانه", exact: true }).click();
  await expect(form.locator("dialog[open]")).toBeVisible();
  await form
    .locator("dialog")
    .getByRole("button", { name: "بستن", exact: true })
    .click();
  await form.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("با موفقیت ذخیره شد.");
  await page.reload();
  await expect(cover).toHaveValue(before);
  const category = await db.category.findUniqueOrThrow({
    where: { id: "seed-category-women" },
  });
  const media = await db.media.findUniqueOrThrow({ where: { id: before } });
  try {
    await form
      .getByRole("button", { name: "پاک‌کردن تصویر", exact: true })
      .click();
    await expect(cover).toHaveValue("");
    await form.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(form.getByRole("status")).toHaveText("با موفقیت ذخیره شد.");
    await page.reload();
    await expect(cover).toHaveValue("");
    expect(
      (await db.category.findUniqueOrThrow({ where: { id: category.id } }))
        .mediaId,
    ).toBeNull();
    const storefront = await page.context().newPage();
    try {
      await storefront.setViewportSize({ width: 1280, height: 900 });
      for (const [locale, market] of [
        ["fa", "IR"],
        ["tr", "TR"],
        ["en", "CA"],
      ]) {
        const slug = (category.slugI18n as Record<string, string>)[locale];
        await storefront.goto(
          `/${locale}/m/${market}/c/${encodeURIComponent(slug)}`,
        );
        const intro = storefront.locator(".shop-category-intro");
        await expect(intro).toBeVisible();
        await expect(intro).not.toHaveClass(/shop-category-with-image/);
        const headerBox = await intro.boundingBox();
        const copyBox = await intro
          .locator(".shop-category-copy")
          .boundingBox();
        expect(headerBox).not.toBeNull();
        expect(copyBox).not.toBeNull();
        expect(Math.abs(headerBox!.width - copyBox!.width)).toBeLessThan(2);
        await shoppingProof(
          storefront,
          info,
          `design-category-no-cover-${locale}-1280`,
        );
      }
    } finally {
      await storefront.close();
    }
    await db.category.update({
      where: { id: category.id },
      data: { mediaId: before },
    });
    await db.media.update({
      where: { id: before },
      data: { deletedAt: new Date() },
    });
    await page.reload();
    await expect(cover).toHaveValue(before);
    await form
      .getByRole("button", { name: "پاک‌کردن تصویر", exact: true })
      .click();
    await form.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(form.getByRole("status")).toHaveText("با موفقیت ذخیره شد.");
    await page.reload();
    await expect(cover).toHaveValue("");
    expect(
      (await db.category.findUniqueOrThrow({ where: { id: category.id } }))
        .mediaId,
    ).toBeNull();
  } finally {
    await db.media.update({
      where: { id: before },
      data: { deletedAt: media.deletedAt, updatedAt: media.updatedAt },
    });
    await db.category.update({
      where: { id: category.id },
      data: { mediaId: before, updatedAt: category.updatedAt },
    });
  }
});

test("category upload retains the old cover until processing completes, then saves the ready image", async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page);
  const category = await db.category.findUniqueOrThrow({
    where: { id: "seed-category-women" },
  });
  await page.goto(
    "/admin/catalog/taxonomy?editKind=category&editId=seed-category-women",
  );
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="kind"][value="category"]') });
  const cover = form.locator('input[name="mediaId"]');
  const before = await cover.inputValue();
  let saveRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/admin/catalog/taxonomy") &&
      request.headers()["next-action"]
    )
      saveRequests++;
  });
  const image = await sharp({
    create: { width: 640, height: 800, channels: 3, background: "#e8792a" },
  })
    .jpeg()
    .toBuffer();
  try {
    await form
      .getByRole("button", { name: "انتخاب رسانه", exact: true })
      .click();
    const uploaded = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/uploads") && res.request().method() === "POST",
    );
    await form.locator('dialog input[type="file"]').setInputFiles({
      name: "category-ready-proof.jpg",
      mimeType: "image/jpeg",
      buffer: image,
    });
    const response = await uploaded;
    expect(response.status()).toBe(202);
    const media = (await response.json()) as { id: string; status: string };
    expect(media.status).toBe("PROCESSING");
    await expect(
      form.locator("dialog[open]").getByRole("status"),
    ).toContainText("پردازش");
    await expect(cover).toHaveValue(before);
    await expect(
      form.getByRole("button", { name: "ذخیره", exact: true }),
    ).toBeDisabled();
    await page.evaluate(() => {
      // A named "id" field shadows HTMLFormElement.id; Playwright's locator
      // selector generation cannot serialize that form. Evaluate via document
      // and call the native prototype without weakening the submit assertion.
      const category = document.querySelector(
        'input[name="kind"][value="category"]',
      );
      const form = category?.closest("form");
      if (!form) throw new Error("Category form missing");
      HTMLFormElement.prototype.requestSubmit.call(form);
    });
    await expect
      .poll(
        async () => {
          const tick = await page.request.post("/api/cron/tick", {
            headers: {
              authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
            },
          });
          expect(tick.ok()).toBe(true);
          return cover.inputValue();
        },
        { timeout: 30000, intervals: [250, 500, 1000] },
      )
      .toBe(media.id);
    await expect(form.locator("dialog")).not.toBeVisible();
    expect(saveRequests).toBe(0);
    await expect(
      form.getByRole("button", { name: "ذخیره", exact: true }),
    ).toBeEnabled();
    await form.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(form.getByRole("status")).toHaveText("با موفقیت ذخیره شد.");
    await page.reload();
    await expect(cover).toHaveValue(media.id);
    expect(
      (await db.media.findUniqueOrThrow({ where: { id: media.id } })).status,
    ).toBe("READY");
  } finally {
    await db.category.update({
      where: { id: category.id },
      data: { mediaId: category.mediaId, updatedAt: category.updatedAt },
    });
  }
});
