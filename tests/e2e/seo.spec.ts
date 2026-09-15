import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { normalizeSeo, type SeoSettings, seoPath } from "../../src/lib/seo";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { ensureMaintenanceOff } from "./helpers/maintenance";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
async function save(page: Page, settings: SeoSettings) {
  await page.goto("/admin/settings/seo");
  const form = page.getByTestId("seo-settings");
  await form.locator('[name="origin"]').fill(settings.origin);
  await form
    .locator('[name="indexingEnabled"]')
    .setChecked(settings.indexingEnabled);
  await form
    .locator('[name="googleVerification"]')
    .fill(settings.googleVerification);
  for (const locale of ["fa", "tr", "en"] as const) {
    await form.locator(`[name="title_${locale}"]`).fill(settings.title[locale]);
    await form
      .locator(`[name="description_${locale}"]`)
      .fill(settings.description[locale]);
  }
  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole("status")).toBeVisible();
}
test("SEO settings control public metadata, stable market URLs and private crawling on mobile", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureMaintenanceOff(page.request);
  const original = (
    await db.siteSettings.findUniqueOrThrow({ where: { id: "default" } })
  ).seo;
  const markets = await db.market.findMany({
    where: { code: { in: ["IR", "TR", "CA"] }, isActive: true },
  });
  const product = await db.product.findFirstOrThrow({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      marketIds: { hasEvery: markets.map((m) => m.id) },
    },
    orderBy: { id: "asc" },
  });
  const slugs = product.slugI18n as Record<string, string>;
  const config = normalizeSeo({
    origin: "https://shop.example.com",
    indexingEnabled: true,
    googleVerification: "fixture-seo-token",
    title: { fa: "نمونه سئو", tr: "SEO örneği", en: "SEO fixture" },
  });
  await page.setViewportSize({ width: 390, height: 844 });
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
  try {
    await save(page, config);
    for (const [locale, messages] of [
      ["fa", fa],
      ["tr", tr],
      ["en", en],
    ] as const) {
      const select = page.locator('[name="adminLocale"]');
      if ((await select.inputValue()) !== locale)
        await Promise.all([
          page.waitForEvent("load"),
          select.selectOption(locale),
        ]);
      await expect(
        page.getByRole("heading", {
          name: messages.seoAdmin.title,
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
    }
    const robots = await page.request.get("/robots.txt");
    expect(await robots.text()).toContain(
      "Sitemap: https://shop.example.com/sitemap.xml",
    );
    const index = await page.request.get("/sitemap.xml");
    expect(index.headers()["content-type"]).toContain("application/xml");
    expect(await index.text()).toContain("/sitemaps/TR/p/0.xml");
    for (const [locale, code] of [
      ["fa", "IR"],
      ["tr", "TR"],
      ["en", "CA"],
    ] as const) {
      await page.context().addCookies([
        {
          name: "market",
          value: code === "TR" ? "IR" : "TR",
          domain: "127.0.0.1",
          path: "/",
        },
      ]);
      const path = seoPath(locale, code, "p", slugs[locale]);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        config.origin + path,
      );
      await expect(
        page.locator(`link[hreflang="${locale}-${code}"]`),
      ).toHaveAttribute("href", config.origin + path);
      await expect(page.locator('link[hreflang="fa-TR"]')).toHaveCount(0);
      await expect(
        page.locator('meta[name="google-site-verification"]'),
      ).toHaveAttribute("content", "fixture-seo-token");
      const sitemap = await page.request.get(`/sitemaps/${code}/p/0.xml`);
      expect(await sitemap.text()).toContain(config.origin + path);
      expect(await sitemap.text()).not.toContain("/admin");
    }
    const redirected = await page.request.get(
      `/tr/p/${encodeURIComponent(slugs.tr)}?market=TR`,
      { maxRedirects: 0 },
    );
    expect(redirected.status()).toBe(301);
    expect(new URL(redirected.headers().location).pathname).toBe(
      seoPath("tr", "TR", "p", slugs.tr),
    );
    expect((await page.request.get("/fa/m/TR")).status()).toBe(404);
    expect((await page.request.get("/en/m/CA/account")).status()).toBe(404);
    for (const path of [
      "/admin/settings/seo",
      "/en/account",
      `/tr/m/TR/p/${encodeURIComponent(slugs.tr)}?preview=1`,
    ])
      expect(
        (await page.request.get(path)).headers()["x-robots-tag"],
      ).toContain("noindex");
    await save(page, { ...config, indexingEnabled: false });
    expect(await (await page.request.get("/robots.txt")).text()).toBe(
      "User-agent: *\nDisallow: /\n",
    );
    expect(await (await page.request.get("/sitemap.xml")).text()).not.toContain(
      "<loc>",
    );
    await page.goto(seoPath("tr", "TR", "p", slugs.tr));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  } finally {
    await save(page, normalizeSeo(original));
    await db.siteSettings.update({
      where: { id: "default" },
      data: { seo: original as Prisma.InputJsonValue },
    });
    const select = page.locator('[name="adminLocale"]');
    if ((await select.inputValue()) !== "fa")
      await Promise.all([page.waitForEvent("load"), select.selectOption("fa")]);
  }
});
