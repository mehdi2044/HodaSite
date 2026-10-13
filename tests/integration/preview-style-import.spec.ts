import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  applyPreviewStyleCatalog,
  planPreviewStyleCatalog,
} from "../../scripts/lib/preview-style-catalog";
import { previousStyleComposition } from "../../prisma/style-seed";
import type { StorageProvider } from "@/modules/integrations/storage";

const url = process.env.PREVIEW_IMPORT_TEST_DATABASE_URL;
const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
const objects = new Map<string, Buffer>();
const store: StorageProvider = {
  async put(key, bytes) {
    objects.set(key, bytes);
    return `/media/${key}`;
  },
  async getBytes(key) {
    return objects.get(key) ?? null;
  },
  async getSignedUrl(key) {
    return `/media/${key}`;
  },
  async delete(key) {
    objects.delete(key);
  },
};
const actorId = "preview-import-owner";
let before: unknown;
async function retainedState() {
  return {
    users: await db.user.findMany(),
    settings: await db.siteSettings.findMany(),
    product: await db.product.findUnique({ where: { id: "merchant-product" } }),
    stock: await db.stockItem.findUnique({ where: { id: "merchant-stock" } }),
    orders: await db.order.count(),
    payments: await db.payment.count(),
  };
}

describe.skipIf(!url)(
  "additive preview catalog import on an isolated PostgreSQL database",
  () => {
    beforeAll(async () => {
      if (
        !url ||
        !new URL(url).pathname.endsWith("_preview_import_test") ||
        url === process.env.TEST_DATABASE_URL
      )
        throw new Error(
          "This proof requires its own empty *_preview_import_test database.",
        );
      if (await db.user.count())
        throw new Error(
          "Import proof database is not empty; refusing to modify it.",
        );
      await db.user.create({
        data: {
          id: actorId,
          email: "preview-owner@example.com",
          passwordHash: "fixture-only",
          name: "Preview owner",
          mfaLastStep: 123n,
          roles: {
            create: {
              role: {
                create: {
                  key: "owner",
                  nameI18n: {},
                  permissions: { create: { permission: "*" } },
                },
              },
            },
          },
        },
      });
      await db.siteSettings.create({
        data: {
          brand: { untouched: true },
          finance: { pricingBaseCurrency: "USD" },
        },
      });
      await db.market.create({
        data: {
          id: "preview-market",
          code: "TR",
          name: "Preview",
          currency: "TRY",
          defaultLocale: "tr",
          enabledLocales: ["fa", "tr", "en"],
          roundingRule: {},
          holdHours: 3,
          paymentDeadlineHours: 48,
          fxMode: "REQUIRE_APPROVAL",
        },
      });
      await db.warehouse.create({
        data: { id: "seed-warehouse-istanbul", code: "IST", nameI18n: {} },
      });
      await db.media.create({
        data: {
          id: "merchant-cover",
          kind: "image",
          status: "READY",
          storageKey: "media/merchant-cover.webp",
          url: "/media/merchant-cover.webp",
          originalName: "merchant.webp",
          mime: "image/webp",
          bytes: 1,
        },
      });
      for (const name of ["women", "men", "kids", "accessories"])
        await db.category.create({
          data: {
            id: `seed-category-${name}`,
            gender: "UNISEX",
            titleI18n: { en: `Merchant ${name}` },
            slugI18n: { en: name },
            mediaId: "merchant-cover",
          },
        });
      await db.product.create({
        data: {
          id: "merchant-product",
          categoryId: "seed-category-women",
          gender: "WOMEN",
          titleI18n: { en: "Merchant original" },
          descriptionI18n: { en: "Retained merchant description" },
          slugI18n: { en: "merchant-original" },
          basePriceAmount: "12.5001",
          basePriceCurrency: "USD",
          marketIds: ["preview-market"],
          variants: {
            create: {
              id: "merchant-variant",
              sku: "MERCHANT-ORIGINAL",
              color: {
                create: { code: "MERCHANT", hex: "#123456", nameI18n: {} },
              },
              size: {
                create: { scale: "INTL", value: "M", groupKey: "merchant" },
              },
            },
          },
        },
      });
      await db.stockItem.create({
        data: {
          id: "merchant-stock",
          warehouseId: "seed-warehouse-istanbul",
          variantId: "merchant-variant",
          onHand: 7,
          reserved: 2,
        },
      });
      await db.homepage.create({
        data: {
          id: "seed-homepage-global",
          blocks: previousStyleComposition(),
        },
      });
      before = await retainedState();
    });
    afterAll(() => db.$disconnect());

    it("plans without writes and refuses an inactive owner or a revoked permission", async () => {
      const plan = await planPreviewStyleCatalog(db, actorId);
      expect(plan.missing).toHaveLength(20);
      expect(await retainedState()).toEqual(before);
      expect(objects.size).toBe(0);
      await db.user.update({
        where: { id: actorId },
        data: { isActive: false },
      });
      await expect(planPreviewStyleCatalog(db, actorId)).rejects.toThrow(
        "owner",
      );
      await db.user.update({
        where: { id: actorId },
        data: { isActive: true },
      });
      const deny = await db.userPermissionOverride.create({
        data: {
          userId: actorId,
          permission: "inventory.receive",
          allow: false,
        },
      });
      await expect(planPreviewStyleCatalog(db, actorId)).rejects.toThrow(
        "owner",
      );
      await db.userPermissionOverride.delete({ where: { id: deny.id } });
      const scopedDeny = await db.userPermissionOverride.create({
        data: {
          userId: actorId,
          permission: "catalog.product.create",
          allow: false,
          scope: { marketId: "preview-market" },
        },
      });
      await expect(planPreviewStyleCatalog(db, actorId)).rejects.toThrow(
        "owner",
      );
      await db.userPermissionOverride.delete({ where: { id: scopedDeny.id } });
      before = await retainedState();
    });

    it("rejects a stale plan and a storage failure before any catalog writes", async () => {
      const plan = await planPreviewStyleCatalog(db, actorId);
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      await db.homepage.update({
        where: { id: home.id },
        data: { blocks: [] },
      });
      await expect(
        applyPreviewStyleCatalog(db, store, actorId, plan),
      ).rejects.toThrow("changed");
      await db.homepage.update({
        where: { id: home.id },
        data: {
          blocks: home.blocks as Prisma.InputJsonValue,
          updatedAt: home.updatedAt,
        },
      });
      await expect(
        applyPreviewStyleCatalog(
          db,
          {
            ...store,
            async put() {
              throw new Error("simulated storage failure");
            },
          },
          actorId,
          plan,
        ),
      ).rejects.toThrow("storage failure");
      expect(await db.product.count()).toBe(1);
      expect(await db.stockMovement.count()).toBe(0);
      expect(await retainedState()).toEqual(before);
    });

    it("imports once under concurrent requests, keeps the hero and merchant data, and never replenishes on replay", async () => {
      const plan = await planPreviewStyleCatalog(db, actorId);
      const attempts = await Promise.allSettled([
        applyPreviewStyleCatalog(db, store, actorId, plan),
        applyPreviewStyleCatalog(db, store, actorId, plan),
      ]);
      expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.product.count({ where: { tags: { has: "style-v2" } } }),
      ).toBe(20);
      expect(
        await db.variant.count({ where: { sku: { startsWith: "STYLE-V2-" } } }),
      ).toBe(50);
      expect(await db.stockMovement.count()).toBe(50);
      expect(await db.lot.count()).toBe(50);
      expect(await retainedState()).toEqual(before);
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      const blocks = home.blocks as Prisma.JsonObject[];
      expect(blocks[0]).toEqual(previousStyleComposition()[0]);
      expect(blocks.filter((b) => b.type === "ProductStrip")).toHaveLength(4);
      expect(blocks[6].type).toBe("ShopLook");
      const stock = await db.stockItem.findFirstOrThrow({
        where: { variantId: "seed-style-v2-women-tee-m" },
      });
      await db.stockItem.update({
        where: { id: stock.id },
        data: { onHand: 4 },
      });
      await db.product.update({
        where: { id: "seed-style-v2-men-tee" },
        data: { deletedAt: new Date(), titleI18n: { en: "Owner archived it" } },
      });
      const snapshot = await db.product.findMany({ orderBy: { id: "asc" } });
      const rerun = await applyPreviewStyleCatalog(
        db,
        store,
        actorId,
        await planPreviewStyleCatalog(db, actorId),
      );
      expect(rerun).toMatchObject({
        productsAdded: 0,
        variantsAdded: 0,
        homepage: "preserved",
      });
      expect(await db.product.findMany({ orderBy: { id: "asc" } })).toEqual(
        snapshot,
      );
      expect(
        (await db.stockItem.findUniqueOrThrow({ where: { id: stock.id } }))
          .onHand,
      ).toBe(4);
      expect(await db.stockMovement.count()).toBe(50);
    }, 60_000);

    it("preserves customized homepage copy and rejects unavailable covers", async () => {
      await db.homepage.update({
        where: { id: "seed-homepage-global" },
        data: { blocks: [{ type: "MerchantCustom", title: "Do not rewrite" }] },
      });
      expect((await planPreviewStyleCatalog(db, actorId)).upgradeHomepage).toBe(
        false,
      );
      await db.media.update({
        where: { id: "merchant-cover" },
        data: { deletedAt: new Date() },
      });
      await expect(planPreviewStyleCatalog(db, actorId)).rejects.toThrow(
        "cover images",
      );
      await db.media.update({
        where: { id: "merchant-cover" },
        data: { deletedAt: null },
      });
    });
  },
);
