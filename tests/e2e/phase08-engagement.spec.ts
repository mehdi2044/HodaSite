import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { ensureMaintenanceOff } from "./helpers/maintenance";
import { fillAdminMfa } from "./helpers/admin-mfa";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
const db = new PrismaClient();
async function admin(page: Page) {
  await page.goto("/admin/login");
  await page
    .locator('[name="email"]')
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator('[name="password"]')
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function customerLogin(page: Page, email: string) {
  await page.goto("/en/account/login?next=/en/account/wishlist");
  await page.locator('main [name="email"]').fill(email);
  await page
    .locator("main form")
    .filter({ has: page.locator('[name="email"]') })
    .locator("button")
    .first()
    .click();
  await expect(page.locator('[name="code"]')).toBeVisible();
  let code = "";
  const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
          },
        });
        const result = await (
          await page.request.get(
            `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json();
        if (!result.messages?.length) return false;
        const mail = await (
          await page.request.get(
            `${mailpit}/api/v1/message/${result.messages[0].ID}`,
          )
        ).json();
        code = mail.Text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
        return code.length === 6;
      },
      { timeout: 45000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  await page.locator('[name="code"]').fill(code);
  await page
    .locator("main form")
    .filter({ has: page.locator('[name="code"]') })
    .locator("button")
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/account\/wishlist$/);
}
for (const [locale, market, slug] of [
  ["en", "CA", "product-1"],
  ["fa", "IR", "محصول-1"],
  ["tr", "TR", "urun-1"],
] as const) {
  test(`${locale}: guest wishlist, recently viewed, consent defaults and accessible product`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await ensureMaintenanceOff(page.request);
    const copy = { en, fa, tr }[locale];
    const external: string[] = [];
    page.on("request", (r) => {
      if (
        /googletagmanager|google-analytics|facebook\.net|facebook\.com\/tr/.test(
          r.url(),
        )
      )
        external.push(r.url());
    });
    await page.goto(`/${locale}/m/${market}/p/${encodeURIComponent(slug)}`);
    const product = await db.product.findFirstOrThrow({
      where: { slugI18n: { path: [locale], equals: slug } },
    });
    const heart = page
      .locator(`button[data-product-id="${product.id}"]`)
      .first();
    await expect(heart).toBeEnabled();
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: copy.consent.reject, exact: true })
      .click();
    expect(external).toEqual([]);
    const slide = page.locator(".shop-gallery-slide").first();
    await slide.focus();
    await page.keyboard.press("Enter");
    const zoom = page.locator("dialog.shop-gallery-zoom");
    await expect(zoom).toBeVisible();
    await expect(
      zoom.getByRole("button", { name: copy.shopping.close }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(zoom).not.toBeVisible();
    await expect(slide).toBeFocused();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.goto(`/${locale}/account/wishlist`);
    await expect(
      page
        .locator("main")
        .getByText((product.titleI18n as Record<string, string>)[locale], {
          exact: true,
        }),
    ).toBeVisible();
    await page.locator(`button[data-product-id="${product.id}"]`).click();
    await expect(
      page.locator("main").getByText(copy.engagement.empty),
    ).toBeVisible();
    await page.goto(`/${locale}/m/${market}`);
    expect(external).toEqual([]);
  });
}
test("verified login merges wishlist; pending reviews/photos stay private until admin approval", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  await ensureMaintenanceOff(page.request);
  const product = await db.product.findFirstOrThrow({
    where: { slugI18n: { path: ["en"], equals: "product-1" } },
  });
  const email = `engagement-${randomUUID()}@example.com`,
    body = `Review fixture ${randomUUID()}`;
  await page.goto("/en/m/CA/p/product-1");
  const heart = page.locator(`button[data-product-id="${product.id}"]`).first();
  await expect(heart).toBeEnabled();
  await heart.click();
  await customerLogin(page, email);
  await expect(
    page
      .locator("main")
      .getByText((product.titleI18n as Record<string, string>).en, {
        exact: true,
      }),
  ).toBeVisible();
  await page.goto("/en/m/CA/p/product-1");
  await page.locator('main textarea[name="body"]').fill(body);
  await page
    .locator("main form")
    .filter({ has: page.locator('textarea[name="body"]') })
    .getByRole("button", { name: en.engagement.submit })
    .click();
  await expect(page.locator('[name="photo"]')).toBeVisible();
  const photo = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#4b5563" },
  })
    .png()
    .toBuffer();
  await page.locator('[name="photo"]').setInputFiles({
    name: "review.png",
    mimeType: "image/png",
    buffer: photo,
  });
  await page
    .locator("main form")
    .filter({ has: page.locator('[name="photo"]') })
    .getByRole("button", { name: en.engagement.submit })
    .click();
  let reviewId = "";
  await expect
    .poll(async () => {
      const r = await db.review.findFirst({
        where: { body },
        include: { photos: true },
      });
      reviewId = r?.id ?? "";
      return r?.photos.length ?? 0;
    })
    .toBe(1);
  const stored = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    include: { photos: { include: { media: true } } },
  });
  const url = `/api/reviews/photos/${stored.photos[0].id}`;
  expect((await request.get(url)).status()).toBe(404);
  expect(
    (await request.get(`/media/${stored.photos[0].media.storageKey}`)).status(),
  ).toBe(404);
  expect(
    await (await request.get("/en/m/CA/p/product-1")).text(),
  ).not.toContain(body);
  await admin(page);
  await page.goto("/admin/content/reviews");
  const card = page.locator("article").filter({ hasText: body });
  await card.locator('[name="reply"]').fill("Fixture reply");
  await card.locator('button[value="APPROVED"]').click();
  await expect
    .poll(
      async () =>
        (await db.review.findUniqueOrThrow({ where: { id: reviewId } })).status,
    )
    .toBe("APPROVED");
  expect((await request.get(url)).status()).toBe(200);
  expect(await (await request.get("/en/m/CA/p/product-1")).text()).toContain(
    body,
  );
  // Keep later storefront captures free of synthetic review copy.
  await db.review.update({
    where: { id: reviewId },
    data: { status: "REJECTED" },
  });
});
test("historical slugs return HTTP 301 and branded social images reject hidden products", async ({
  request,
}) => {
  await ensureMaintenanceOff(request);
  const source = await db.product.findFirstOrThrow({
    where: { slugI18n: { path: ["en"], equals: "product-1" } },
  });
  const suffix = randomUUID();
  const first = `history-${suffix}`,
    last = `renamed-${suffix}`;
  const p = await db.product.create({
    data: {
      titleI18n: { en: "Social preview fixture" },
      slugI18n: { en: first },
      descriptionI18n: {},
      categoryId: source.categoryId,
      gender: source.gender,
      basePriceAmount: "10",
      marketIds: source.marketIds,
      status: "ACTIVE",
    },
  });
  try {
    await db.product.update({
      where: { id: p.id },
      data: { slugI18n: { en: last } },
    });
    const result = await request.get(`/en/m/CA/p/${first}`, {
      maxRedirects: 0,
    });
    expect(result.status()).toBe(301);
    expect(result.headers().location).toContain(last);
    const og = await request.get(`/og/en/CA/p/${last}`);
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toBe("image/png");
    const meta = await sharp(await og.body()).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    await db.product.update({ where: { id: p.id }, data: { status: "DRAFT" } });
    expect((await request.get(`/og/en/CA/p/${last}`)).status()).toBe(404);
    expect(
      (await request.get(`/en/m/CA/p/${first}`, { maxRedirects: 0 })).status(),
    ).toBe(404);
  } finally {
    await db.product.update({
      where: { id: p.id },
      data: { deletedAt: new Date() },
    });
  }
});

test("consent gates analytics requests and withdrawal clears the loaded document", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureMaintenanceOff(page.request);
  const original = (
    await db.siteSettings.findUniqueOrThrow({ where: { id: "default" } })
  ).seo as { analytics?: { ga4?: string; gtm?: string; meta?: string } };
  await page.route(/googletagmanager\.com|facebook\.net/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "/* local analytics fixture */",
    }),
  );
  const saveIds = async (ids: {
    ga4?: string;
    gtm?: string;
    meta?: string;
  }) => {
    await page.goto("/admin/settings/seo");
    for (const key of ["ga4", "gtm", "meta"] as const)
      await page.locator(`[name="${key}"]`).fill(ids[key] ?? "");
    await page
      .getByTestId("seo-settings")
      .locator('button[type="submit"]')
      .click();
    await expect(
      page.getByTestId("seo-settings").getByRole("status"),
    ).toBeVisible();
  };
  await admin(page);
  try {
    await saveIds({ ga4: "G-TEST1234" });
    await page.goto("/en/m/CA");
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: en.consent.accept }).click();
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(
      1,
    );
    await page.goto("/en/account/wishlist");
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(
      0,
    );
    await page.goto("/en/m/CA");
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(
      1,
    );
    await page.getByRole("button", { name: en.consent.settings }).click();
    await page.getByRole("button", { name: en.consent.reject }).click();
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(
      0,
    );
  } finally {
    await saveIds(original.analytics ?? {});
  }
});

test("local launch evidence is recorded with history but does not satisfy real restore acceptance", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureMaintenanceOff(page.request);
  await admin(page);
  await page.goto("/admin/system/launch");
  const form = page
    .locator("form")
    .filter({ has: page.locator('[name="revision"]') });
  const reference = `evidence-${randomUUID()}`;
  await form.locator('[name="gate"]').selectOption("restoreDrill");
  await form.locator('[name="environment"]').selectOption("local");
  await form.locator('[name="origin"]').fill("https://fixture.example.com");
  await form.locator('[name="revision"]').fill("b".repeat(40));
  await form.locator('[name="testedAt"]').fill(new Date().toISOString());
  await form.locator('[name="result"]').selectOption("PASS");
  await form.locator('[name="reference"]').fill(reference);
  await form
    .locator('[name="notes"]')
    .fill("Local fixture only; no real restore attested.");
  await form.locator("button").click();
  await expect(form.getByRole("status")).toBeVisible();
  await expect(
    page.getByTestId("launch-restoreDrill").locator('[data-status="pending"]'),
  ).toBeVisible();
  const detail = page.locator("details").filter({ hasText: reference });
  await detail.locator("summary").click();
  await expect(detail.getByText(reference, { exact: true })).toBeVisible();
});

test("home, category and cart pass WCAG automated checks", async ({ page }) => {
  test.setTimeout(90000);
  await ensureMaintenanceOff(page.request);
  const category = await db.category.findFirstOrThrow({
    where: { deletedAt: null, slugI18n: { path: ["en"], not: "" } },
  });
  const slug = (category.slugI18n as Record<string, string>).en;
  for (const path of [
    "/en/m/CA",
    `/en/m/CA/c/${encodeURIComponent(slug)}`,
    "/en/cart",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});

test("changing or resetting category filters clears both pagination parameters", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureMaintenanceOff(page.request);
  const product = await db.product.findFirstOrThrow({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      slugI18n: { path: ["en"], equals: "product-1" },
    },
    include: { category: true },
  });
  const slug = (product.category.slugI18n as Record<string, string>).en;
  const path = `/en/m/CA/c/${encodeURIComponent(slug)}`;
  await page.goto(`${path}?after=${product.id}&page=2`);
  await page.locator(".shop-filter-toggle").click();
  await page.locator('dialog [name="sort"]').selectOption("price-desc");
  await page.locator('dialog button[type="submit"]').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.has("after"))
    .toBe(false);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.goto(`${path}?after=${product.id}&page=2&sort=price-desc`);
  await page.locator(".shop-filter-toggle").click();
  await page.locator(".shop-reset").click();
  await expect
    .poll(() => new URL(page.url()).searchParams.has("after"))
    .toBe(false);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
});

test("earlier-phase admin settings follow the saved language, including the theme preview", async ({
  page,
}) => {
  test.setTimeout(150000);
  await ensureMaintenanceOff(page.request);
  await admin(page);
  for (const locale of ["en", "tr", "fa"] as const) {
    const copy = { en, tr, fa }[locale].foundationAdmin;
    await Promise.all([
      page.waitForEvent("load"),
      page.locator('[name="adminLocale"]').selectOption(locale),
    ]);
    await expect(page.locator('[name="adminLocale"]')).toHaveValue(locale);
    // Wait for the document reload triggered by the saved preference.
    await expect(page.locator(".admin")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    for (const [path, title] of [
      ["settings/brand", copy.brand],
      ["settings/contact", copy.contact],
      ["settings/legal", copy.legal],
      ["settings/social", copy.social],
      ["settings/maintenance", copy.maintenance],
      ["users/new", copy.newUser],
      ["markets", copy.markets],
    ]) {
      await page.goto(`/admin/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      if (path === "settings/social") {
        await expect(
          page.getByRole("button", { name: copy.save, exact: true }),
        ).toBeVisible();
      }
    }
    await page.goto("/admin/preview/theme");
    await expect(page.getByText(copy.preview, { exact: true })).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    await page.goto("/admin");
  }
});
