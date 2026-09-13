import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { listBestsellers } from "@/modules/catalog";
import {
  homepageProducts,
  homepageSourceExists,
} from "@/modules/content/homepage-products";
import { returnFixture } from "../helpers/returns";

// A dedicated market keeps historical merchandising data from other tests out.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "homepage product sources",
  () => {
    let code: string, marketId: string;
    beforeAll(async () => {
      code = `HP-${Date.now()}`;
      marketId = (
        await db.market.create({
          data: {
            code,
            name: "Homepage test",
            currency: "TRY",
            defaultLocale: "en",
            enabledLocales: ["en"],
            roundingRule: {},
            holdHours: 1,
            paymentDeadlineHours: 1,
            fxMode: "AUTO_ACCEPT",
          },
        })
      ).id;
    });
    it("ranks paid quantities subtracts received returns and excludes unpaid, cancelled, refunded and exchange orders", async () => {
      const first = await returnFixture(db, { code, quantity: 5 });
      const second = await returnFixture(db, { code, quantity: 3 });
      const productIds = [first, second].map((f) => f.variants[0].productId);
      await db.product.updateMany({
        where: { id: { in: productIds } },
        data: { marketIds: [marketId] },
      });
      expect((await listBestsellers(marketId)).map((p) => p.id)).toEqual(
        productIds,
      );
      await db.returnRequest.create({
        data: {
          orderId: first.order.id,
          customerId: first.customer.id,
          type: "RETURN",
          reasonCode: "TEST",
          receivedAt: new Date(),
          items: {
            create: {
              orderItemId: first.order.items[0].id,
              quantity: 4,
              condition: "RESTOCK",
            },
          },
        },
      });
      expect((await listBestsellers(marketId)).map((p) => p.id)).toEqual(
        [...productIds].reverse(),
      );
      for (const status of [
        "CANCELLED",
        "REFUNDED",
        "PENDING_PAYMENT",
      ] as const) {
        await db.order.update({
          where: { id: second.order.id },
          data: {
            status,
            paidAt: status === "PENDING_PAYMENT" ? null : new Date(),
          },
        });
        expect((await listBestsellers(marketId)).map((p) => p.id)).toEqual([
          productIds[0],
        ]);
      }
      await db.order.update({
        where: { id: second.order.id },
        data: { status: "PAID", paidAt: new Date(), kind: "EXCHANGE" },
      });
      expect((await listBestsellers(marketId)).map((p) => p.id)).toEqual([
        productIds[0],
      ]);
      for (const data of [
        { status: "DRAFT" as const },
        { status: "ACTIVE" as const, deletedAt: new Date() },
        { deletedAt: null, marketIds: [] },
      ]) {
        await db.product.update({ where: { id: productIds[0] }, data });
        expect(await listBestsellers(marketId)).toEqual([]);
      }
      expect(await listBestsellers("another-market")).toEqual([]);
    });
    it("filters a product strip by the chosen category or collection and market", async () => {
      const f = await returnFixture(db, { code, pending: true });
      const category = await db.category.create({
        data: { titleI18n: {}, slugI18n: {}, gender: "UNISEX" },
      });
      const collection = await db.collection.create({
        data: { slug: `${code}-selected`, titleI18n: {} },
      });
      const productId = f.variants[0].productId;
      await db.product.update({
        where: { id: productId },
        data: {
          marketIds: [marketId],
          categoryId: category.id,
          collections: { connect: { id: collection.id } },
        },
      });
      for (const [mode, referenceId] of [
        ["category", category.id],
        ["collection", collection.id],
      ] as const) {
        expect(
          (
            await homepageProducts(marketId, "en", {
              mode,
              referenceId,
              limit: 1,
            })
          ).items.map((p) => p.id),
        ).toEqual([productId]);
        expect(
          (
            await homepageProducts("other-market", "en", {
              mode,
              referenceId,
              limit: 1,
            })
          ).items,
        ).toEqual([]);
      }
      await db.category.update({
        where: { id: category.id },
        data: { deletedAt: new Date() },
      });
      expect(
        (
          await homepageProducts(marketId, "en", {
            mode: "category",
            referenceId: category.id,
            limit: 4,
          })
        ).items,
      ).toEqual([]);
    });
    it("fails closed for missing and deleted source references", async () => {
      expect(await homepageSourceExists({ mode: "category", limit: 4 })).toBe(
        false,
      );
      expect(
        (
          await homepageProducts(marketId, "en", {
            mode: "collection",
            referenceId: "missing",
            limit: 4,
          })
        ).items,
      ).toEqual([]);
      const collection = await db.collection.create({
        data: { slug: code, titleI18n: {}, deletedAt: new Date() },
      });
      expect(
        await homepageSourceExists({
          mode: "collection",
          referenceId: collection.id,
          limit: 4,
        }),
      ).toBe(false);
    });
  },
);
