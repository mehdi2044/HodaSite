import { costSnapshot } from "@/modules/finance/cost-snapshot";
import { recognizePaidOrder, recognizeReturn } from "@/modules/finance/events";
import {
  reserveOrderInventory,
  consumeOrderInventory,
} from "@/modules/inventory";
import { seedLedgerAccounts } from "../../prisma/ledger-seed";
import { createHash, randomUUID } from "node:crypto";
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
      for (const lot of await db.lot.findMany()) {
        expect(
          costSnapshot(
            lot.unitCostCurrency,
            lot.fxRateSnapshot,
            lot.receivedAt,
          ),
        ).toMatchObject({ currency: "USD", rateTry: "1", rateUsd: "1" });
        expect(lot.unitCostAmount.toFixed(4)).toBe("0.0000");
        expect(lot.unitCostAmountTry.toFixed(4)).toBe("0.0000");
        expect(lot.unitCostAmountUsd.toFixed(4)).toBe("0.0000");
      }
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
    it("sells an actually imported zero-cost lot and commits its finance-enabled restock", async () => {
      const variantId = "seed-style-v2-women-tee-m";
      const stock = await db.stockItem.findFirstOrThrow({
        where: { variantId },
      });
      const lot = await db.lot.findFirstOrThrow({ where: { variantId } });
      const market = await db.market.findUniqueOrThrow({
        where: { id: "preview-market" },
      });
      const customer = await db.customer.create({
        data: { email: `demo-sale-${randomUUID()}@example.com` },
      });
      const cart = await db.cart.create({
        data: {
          customerId: customer.id,
          marketId: market.id,
          currency: market.currency,
          locale: "en",
          tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const variant = await db.variant.findUniqueOrThrow({
        where: { id: variantId },
        include: { product: true },
      });
      const sequence = await db.orderSequence.upsert({
        where: { id: market.id },
        create: { id: market.id, value: 100001 },
        update: { value: { increment: 1 } },
      });
      // OrderItem is append-only: create the immutable snapshot with the actual
      // imported variant; never retarget a previously created fixture item.
      const order = await db.order.create({
        data: {
          number: `${market.code}-${sequence.value}`,
          marketId: market.id,
          customerId: customer.id,
          cartId: cart.id,
          guestTokenHash: cart.tokenHash,
          locale: "en",
          currency: market.currency,
          kind: "SALE",
          status: "PENDING_PAYMENT",
          subtotalAmount: "40",
          discountAmount: "0",
          feeTotalAmount: "0",
          totalAmount: "40",
          totalAmountTry: "40",
          totalAmountUsd: "1",
          fxSnapshot: {
            marketPerUsd: "40",
            tryPerUsd: "40",
            quotedAt: new Date().toISOString(),
          },
          bankSnapshot: [],
          contactSnapshot: { email: customer.email, firstName: "Demo test" },
          shippingAddress: { line1: "Test address" },
          billingAddress: {},
          holdExpiresAt: new Date(Date.now() + 86400000),
          paymentDeadlineAt: new Date(Date.now() + 86400000),
          items: {
            create: {
              variantId,
              quantity: 1,
              unitPriceAmount: "40",
              lineTotalAmount: "40",
              currency: market.currency,
              weightGrams: 100,
              productSnapshot: { title: variant.product.titleI18n },
            },
          },
        },
        include: { items: true },
      });
      const f = { order, customer, market };
      await seedLedgerAccounts(db);
      await db.financeConfig.create({
        data: {
          id: f.market.id,
          enabled: true,
          enabledAt: new Date(Date.now() - 60000),
        },
      });
      await db.$transaction(async (tx) => {
        await reserveOrderInventory(
          tx,
          f.order.id,
          [{ variantId, quantity: 1 }],
          "HOLD",
          new Date(Date.now() + 60000),
        );
        await consumeOrderInventory(tx, f.order.id, actorId);
        await tx.order.update({
          where: { id: f.order.id },
          data: {
            status: "DELIVERED",
            paidAt: new Date(),
            deliveredAt: new Date(),
          },
        });
        await tx.payment.create({
          data: {
            orderId: f.order.id,
            amount: "40",
            currency: "TRY",
            status: "APPROVED",
          },
        });
        await recognizePaidOrder(tx, f.order.id, actorId);
      });
      expect(
        await db.journalEntry.count({
          where: { requestKey: `sale:${f.order.id}` },
        }),
      ).toBe(1);
      expect(
        (await db.stockItem.findUniqueOrThrow({ where: { id: stock.id } }))
          .onHand,
      ).toBe(stock.onHand - 1);
      const returned = await db.$transaction(async (tx) => {
        const request = await tx.returnRequest.create({
          data: {
            orderId: f.order.id,
            customerId: f.customer.id,
            type: "RETURN",
            reasonCode: "SIZE",
            status: "RECEIVED",
            receivedAt: new Date(),
            items: {
              create: {
                orderItemId: f.order.items[0].id,
                quantity: 1,
                condition: "RESTOCK",
              },
            },
          },
          include: { items: true },
        });
        await tx.lot.update({
          where: { id: lot.id },
          data: { qtyRemaining: { increment: 1 } },
        });
        await tx.stockItem.update({
          where: { id: stock.id },
          data: { onHand: { increment: 1 } },
        });
        const move = await tx.stockMovement.create({
          data: {
            stockItemId: stock.id,
            warehouseId: stock.warehouseId,
            variantId,
            lotId: lot.id,
            type: "RETURN_RESTOCK",
            quantity: 1,
            referenceId: request.items[0].id,
            createdBy: actorId,
          },
        });
        await recognizeReturn(tx, request.id, actorId);
        return { requestId: request.id, movementId: move.id };
      });
      expect(
        await db.returnRequest.count({
          where: { id: returned.requestId, status: "RECEIVED" },
        }),
      ).toBe(1);
      expect(
        await db.stockMovement.count({
          where: { id: returned.movementId, type: "RETURN_RESTOCK" },
        }),
      ).toBe(1);
      expect(
        (await db.stockItem.findUniqueOrThrow({ where: { id: stock.id } }))
          .onHand,
      ).toBe(stock.onHand);
      expect(
        (await db.lot.findUniqueOrThrow({ where: { id: lot.id } }))
          .qtyRemaining,
      ).toBe(lot.qtyRemaining);
      expect(
        await db.journalEntry.count({
          where: { requestKey: `restock:${returned.movementId}` },
        }),
      ).toBe(0);
      expect(
        await db.journalEntry.count({
          where: { memo: f.order.number, requestKey: { startsWith: "cogs:" } },
        }),
      ).toBe(0);
      // Repeat accounting recognition without repeating the inventory mutation.
      await db.$transaction((tx) =>
        recognizeReturn(tx, returned.requestId, actorId),
      );
      expect(
        await db.journalEntry.count({ where: { memo: f.order.number } }),
      ).toBe(2);
    });
  },
);
