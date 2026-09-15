import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (actor.id ? { user: { id: actor.id } } : null),
}));
import { db } from "@/lib/db";
import { setMaintenanceFlag } from "@/modules/settings";
import { getSitemapIndex, getSitemapPage } from "@/modules/seo";
import { saveSeo } from "@/app/admin/(dashboard)/settings/seo/actions";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
let original: Prisma.InputJsonValue;
let marketId = "",
  marketCode = "",
  productId = "",
  ownerId = "",
  deniedId = "";
const pages: string[] = [];
function form() {
  const f = new FormData();
  f.set("origin", "https://shop.example.com");
  f.set("indexingEnabled", "on");
  f.set("googleVerification", "fixture-token");
  for (const locale of ["fa", "tr", "en"]) {
    f.set(`title_${locale}`, `Fixture ${locale}`);
    f.set(`description_${locale}`, "");
  }
  return f;
}
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "SEO settings and public sitemap database boundaries",
  () => {
    beforeAll(async () => {
      original = (
        await db.siteSettings.findUniqueOrThrow({ where: { id: "default" } })
      ).seo as Prisma.InputJsonValue;
      setMaintenanceFlag(false);
      const m = await db.market.create({
        data: {
          code: `SEO${suffix}`,
          name: "SEO fixture",
          currency: "USD",
          defaultLocale: "en",
          enabledLocales: ["en"],
          roundingRule: {},
          holdHours: 1,
          paymentDeadlineHours: 1,
          fxMode: "AUTO_ACCEPT",
        },
      });
      marketId = m.id;
      marketCode = m.code;
      const category = await db.category.findFirstOrThrow({
        where: { deletedAt: null },
      });
      const p = await db.product.create({
        data: {
          slugI18n: {
            en: `seo-visible-${suffix}`,
            fa: `seo-hidden-locale-${suffix}`,
          },
          titleI18n: { en: "SEO fixture" },
          descriptionI18n: {},
          gender: category.gender,
          categoryId: category.id,
          basePriceAmount: "10",
          status: "ACTIVE",
          marketIds: [marketId],
        },
      });
      productId = p.id;
      for (const status of ["published", "draft"]) {
        const page = await db.page.create({
          data: {
            slugI18n: { en: `seo-${status}-${suffix}` },
            titleI18n: { en: status },
            status,
            marketIds: [marketId],
            blocks: [],
          },
        });
        pages.push(page.id);
      }
      for (const key of ["owner", "warehouse"]) {
        const role = await db.role.findUniqueOrThrow({ where: { key } });
        const u = await db.user.create({
          data: {
            email: `seo-${key}-${suffix}@example.com`,
            name: "SEO fixture",
            passwordHash: "unused",
            roles: { create: { roleId: role.id } },
          },
        });
        if (key === "owner") ownerId = u.id;
        else deniedId = u.id;
      }
    });
    afterAll(async () => {
      if (original !== undefined)
        await db.siteSettings.update({
          where: { id: "default" },
          data: { seo: original },
        });
      if (productId)
        await db.product.update({
          where: { id: productId },
          data: { deletedAt: new Date() },
        });
      if (marketId)
        await db.market.update({
          where: { id: marketId },
          data: { isActive: false },
        });
      await db.page.updateMany({
        where: { id: { in: pages } },
        data: { deletedAt: new Date() },
      });
      await db.user.updateMany({
        where: { id: { in: [ownerId, deniedId].filter(Boolean) } },
        data: { isActive: false },
      });
      actor.id = "";
    });
    it("denies unauthorized changes before reading or mutating settings", async () => {
      actor.id = deniedId;
      const before = await db.siteSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      expect((await saveSeo(null, form())).ok).toBe(false);
      expect(
        (await db.siteSettings.findUniqueOrThrow({ where: { id: "default" } }))
          .seo,
      ).toEqual(before.seo);
      actor.id = "";
      expect((await saveSeo(null, form())).ok).toBe(false);
    });
    it("validates and audits saves without removing pre-existing JSON keys", async () => {
      await db.siteSettings.update({
        where: { id: "default" },
        data: { seo: { retainedFixture: suffix } },
      });
      actor.id = ownerId;
      const bad = form();
      bad.set("origin", "https://user:password@example.com/private");
      expect((await saveSeo(null, bad)).ok).toBe(false);
      expect((await saveSeo(null, form())).ok).toBe(true);
      expect(
        (await db.siteSettings.findUniqueOrThrow({ where: { id: "default" } }))
          .seo,
      ).toMatchObject({ retainedFixture: suffix, indexingEnabled: true });
      expect(
        await db.auditLog.count({
          where: { userId: ownerId, action: "settings.seo.update" },
        }),
      ).toBe(1);
    });
    it("lists only published visible content in enabled languages, and closes when indexing is off", async () => {
      expect(await getSitemapIndex()).toContain(
        `/sitemaps/${marketCode}/p/0.xml`,
      );
      const xml = await getSitemapPage(marketCode, "p", "0.xml");
      expect(xml).toContain(`seo-visible-${suffix}`);
      expect(xml).not.toContain(`seo-hidden-locale-${suffix}`);
      const cms = await getSitemapPage(marketCode, "pages", "0.xml");
      expect(cms).toContain(`seo-published-${suffix}`);
      expect(cms).not.toContain(`seo-draft-${suffix}`);
      await db.product.update({
        where: { id: productId },
        data: { status: "DRAFT" },
      });
      expect(await getSitemapPage(marketCode, "p", "0.xml")).not.toContain(
        `seo-visible-${suffix}`,
      );
      expect(await getSitemapPage(marketCode, "p", "-1.xml")).toBeNull();
      await db.siteSettings.update({
        where: { id: "default" },
        data: { seo: {} },
      });
      expect(await getSitemapIndex()).not.toContain("<loc>");
      expect(await getSitemapPage(marketCode, "p", "0.xml")).not.toContain(
        "<loc>",
      );
    });
  },
);
