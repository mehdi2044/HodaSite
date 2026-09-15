import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
const actor = vi.hoisted(() => ({
  id: "",
  admin: "",
  send: vi.fn().mockResolvedValue({ id: "fixture" }),
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () => {
    const { db } = await import("@/lib/db");
    return actor.id
      ? db.customer.findFirst({ where: { id: actor.id, isActive: true } })
      : null;
  },
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (actor.admin ? { user: { id: actor.admin } } : null),
}));
vi.mock("@/modules/notifications", async (original) => ({
  ...(await original<typeof import("@/modules/notifications")>()),
  getEmailProvider: () => ({ send: actor.send }),
}));
import { db } from "@/lib/db";
import { setMaintenanceFlag } from "@/modules/settings";
import {
  wishlist,
  mergeWishlist,
  removeWishlist,
  publicCards,
  submitReview,
  publicReviews,
  moderateReview,
  setStockAlert,
} from "@/modules/engagement";
import { addReviewPhoto, reviewPhotoBytes } from "@/modules/engagement/photos";
import { resolveSlugRedirect } from "@/modules/seo/redirects";
import { recordLaunchEvidence } from "@/modules/launch/evidence";
import {
  registerStockJobs,
  scheduleStockAlerts,
} from "@/modules/engagement/stock-jobs";
import { runJobs } from "@/modules/jobs";
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
let marketId = "",
  productId = "",
  variantId = "",
  ownerId = "",
  deniedId = "",
  first = "",
  second = "",
  reviewId = "";
const context = () => ({ marketId, locale: "en" as const });
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Phase 08 ownership, publication, migration and notifications",
  () => {
    beforeAll(async () => {
      setMaintenanceFlag(false);
      const m = await db.market.create({
        data: {
          code: `ENG${suffix}`,
          name: "Engagement fixture",
          currency: "USD",
          defaultLocale: "en",
          enabledLocales: ["en", "fa", "tr"],
          roundingRule: {},
          holdHours: 1,
          paymentDeadlineHours: 1,
          fxMode: "AUTO_ACCEPT",
        },
      });
      marketId = m.id;
      const category = await db.category.findFirstOrThrow({
        where: { deletedAt: null },
      });
      const p = await db.product.create({
        data: {
          slugI18n: {
            en: `eng-${suffix}`,
            fa: `fa-${suffix}`,
            tr: `tr-${suffix}`,
          },
          titleI18n: { en: "Engagement fixture" },
          descriptionI18n: {},
          gender: category.gender,
          categoryId: category.id,
          basePriceAmount: "10",
          status: "ACTIVE",
          marketIds: [marketId],
        },
      });
      productId = p.id;
      const sample = await db.variant.findFirstOrThrow();
      variantId = (
        await db.variant.create({
          data: {
            productId,
            colorId: sample.colorId,
            sizeId: sample.sizeId,
            sku: `ENG-${suffix}`,
          },
        })
      ).id;
      first = (
        await db.customer.create({
          data: { email: `eng-first-${suffix}@example.com`, isGuest: false },
        })
      ).id;
      second = (
        await db.customer.create({
          data: { email: `eng-second-${suffix}@example.com`, isGuest: false },
        })
      ).id;
      for (const key of ["owner", "warehouse"]) {
        const role = await db.role.findUniqueOrThrow({ where: { key } });
        const user = await db.user.create({
          data: {
            email: `eng-${key}-${suffix}@example.com`,
            name: "Engagement fixture",
            passwordHash: "unused",
            roles: { create: { roleId: role.id } },
          },
        });
        if (key === "owner") ownerId = user.id;
        else deniedId = user.id;
      }
    });
    afterAll(async () => {
      actor.id = "";
      actor.admin = "";
      setMaintenanceFlag(false);
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
      await db.customer.updateMany({
        where: { id: { in: [first, second].filter(Boolean) } },
        data: { isActive: false },
      });
      await db.user.updateMany({
        where: { id: { in: [ownerId, deniedId].filter(Boolean) } },
        data: { isActive: false },
      });
    });
    it("rejects unauthenticated writes and does not trust caller ownership", async () => {
      actor.id = "";
      expect(await wishlist(context())).toEqual({
        authenticated: false,
        ids: [],
      });
      await expect(mergeWishlist(context(), [productId])).rejects.toThrow(
        "UNAUTHENTICATED",
      );
      await expect(
        submitReview(context(), { productId, rating: 5, body: "Fixture" }),
      ).rejects.toThrow("UNAUTHENTICATED");
    });
    it("merges duplicate guest IDs atomically and isolates customer wishlists", async () => {
      actor.id = first;
      await Promise.all([
        mergeWishlist(context(), [productId, productId]),
        mergeWishlist(context(), [productId]),
      ]);
      expect((await wishlist(context())).ids).toEqual([productId]);
      actor.id = second;
      expect((await wishlist(context())).ids).toEqual([]);
      await removeWishlist(context(), productId);
      actor.id = first;
      expect((await wishlist(context())).ids).toEqual([productId]);
    });
    it("hides unpublished products and rejects disabled markets", async () => {
      await db.product.update({
        where: { id: productId },
        data: { status: "DRAFT" },
      });
      expect(await publicCards(context(), [productId])).toEqual([]);
      await db.product.update({
        where: { id: productId },
        data: { status: "ACTIVE" },
      });
      await expect(
        wishlist({ ...context(), marketId: "missing" }),
      ).rejects.toThrow("FORBIDDEN");
    });
    it("requires valid ratings and keeps unapproved reviews out of public aggregates", async () => {
      actor.id = first;
      await expect(
        submitReview(context(), { productId, rating: 6, body: "Fixture" }),
      ).rejects.toThrow();
      reviewId = (
        await submitReview(context(), {
          productId,
          rating: 4,
          body: "A fixture review.",
        })
      ).id;
      const stored = await db.review.findUniqueOrThrow({
        where: { id: reviewId },
      });
      expect(stored.verifiedPurchase).toBe(false);
      expect(await publicReviews(context(), productId)).toMatchObject({
        count: 0,
        rating: null,
        items: [],
      });
    });
    it("enforces moderation permission, stale edit checks and locale filtering", async () => {
      let review = await db.review.findUniqueOrThrow({
        where: { id: reviewId },
      });
      await expect(
        moderateReview(deniedId, {
          id: reviewId,
          status: "APPROVED",
          reply: "",
          updatedAt: review.updatedAt,
        }),
      ).rejects.toThrow("FORBIDDEN");
      await moderateReview(ownerId, {
        id: reviewId,
        status: "APPROVED",
        reply: "Thank you.",
        updatedAt: review.updatedAt,
      });
      expect(await publicReviews(context(), productId)).toMatchObject({
        count: 1,
        rating: 4,
      });
      expect(
        (await publicReviews({ ...context(), locale: "fa" }, productId)).count,
      ).toBe(0);
      review = await db.review.findUniqueOrThrow({ where: { id: reviewId } });
      await submitReview(context(), {
        productId,
        rating: 3,
        body: "Edited fixture review.",
      });
      await expect(
        moderateReview(ownerId, {
          id: reviewId,
          status: "APPROVED",
          reply: "",
          updatedAt: review.updatedAt,
        }),
      ).rejects.toThrow("FORBIDDEN");
      expect((await publicReviews(context(), productId)).count).toBe(0);
    });
    it("re-encodes private review photos, enforces owner/count and only publishes after moderation", async () => {
      const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: "red" },
      })
        .jpeg()
        .toBuffer();
      const file = new File([new Uint8Array(image)], "../../fixture.jpg", {
        type: "image/jpeg",
      });
      actor.id = second;
      await expect(addReviewPhoto(reviewId, file)).rejects.toThrow("FORBIDDEN");
      actor.id = first;
      await addReviewPhoto(reviewId, file);
      const photo = await db.reviewPhoto.findFirstOrThrow({
        where: { reviewId },
        include: { media: true },
      });
      expect(photo.media.storageKey).toMatch(
        /^media\/\d{4}\/\d{2}\/[\w-]+\.webp$/,
      );
      actor.id = "";
      expect(await reviewPhotoBytes(photo.id)).toBeNull();
      const review = await db.review.findUniqueOrThrow({
        where: { id: reviewId },
      });
      await moderateReview(ownerId, {
        id: reviewId,
        status: "APPROVED",
        reply: "",
        updatedAt: review.updatedAt,
      });
      expect(await reviewPhotoBytes(photo.id)).not.toBeNull();
      actor.id = first;
      await addReviewPhoto(reviewId, file);
      await addReviewPhoto(reviewId, file);
      await expect(addReviewPhoto(reviewId, file)).rejects.toThrow("FORBIDDEN");
      expect((await publicReviews(context(), productId)).count).toBe(0);
      await expect(
        addReviewPhoto(reviewId, new File(["<svg/>"], "x.jpg")),
      ).rejects.toThrow();
    });
    it("captures repeated slug changes by stable ID and never redirects to hidden products", async () => {
      const old = `eng-${suffix}`,
        middle = `eng-middle-${suffix}`,
        last = `eng-last-${suffix}`;
      await db.product.update({
        where: { id: productId },
        data: { slugI18n: { en: middle } },
      });
      await db.product.update({
        where: { id: productId },
        data: { slugI18n: { en: last } },
      });
      expect(
        await resolveSlugRedirect({
          locale: "en",
          market: `ENG${suffix}`,
          kind: "p",
          slug: old,
        }),
      ).toContain(last);
      expect(
        await resolveSlugRedirect({
          locale: "en",
          market: `ENG${suffix}`,
          kind: "p",
          slug: middle,
        }),
      ).toContain(last);
      await db.product.update({
        where: { id: productId },
        data: { status: "DRAFT" },
      });
      expect(
        await resolveSlugRedirect({
          locale: "en",
          market: `ENG${suffix}`,
          kind: "p",
          slug: old,
        }),
      ).toBeNull();
      await db.product.update({
        where: { id: productId },
        data: { status: "ACTIVE" },
      });
    });
    it("deduplicates stock alert subscriptions, supports cancellation and queues only available variants", async () => {
      actor.id = first;
      await Promise.all([
        setStockAlert(context(), { variantId, active: true }),
        setStockAlert(context(), { variantId, active: true }),
      ]);
      expect(
        await db.stockAlert.count({ where: { customerId: first, variantId } }),
      ).toBe(1);
      await setStockAlert(context(), { variantId, active: false });
      expect(
        (
          await db.stockAlert.findFirstOrThrow({
            where: { customerId: first, variantId },
          })
        ).active,
      ).toBe(false);
      await setStockAlert(context(), { variantId, active: true });
      const alert = await db.stockAlert.findFirstOrThrow({
        where: { customerId: first, variantId },
      });
      await scheduleStockAlerts();
      expect(
        await db.job.findUnique({
          where: { id: `stock-${alert.id}-${alert.generation}` },
        }),
      ).toBeNull();
      const warehouse = await db.warehouse.findFirstOrThrow();
      await db.stockItem.create({
        data: { variantId, warehouseId: warehouse.id, onHand: 2 },
      });
      await Promise.all([scheduleStockAlerts(), scheduleStockAlerts()]);
      expect(
        await db.job.count({
          where: { id: `stock-${alert.id}-${alert.generation}` },
        }),
      ).toBe(1);
      await setStockAlert(context(), { variantId, active: false });
      registerStockJobs();
      await runJobs(["stock-alert"]);
      expect(actor.send).not.toHaveBeenCalled();
    });
    it("records permission-checked append-only launch evidence and rejects future attestations", async () => {
      const value = {
        gate: "restoreDrill",
        environment: "staging",
        origin: `https://eng-${suffix}.example.com`,
        revision: "a".repeat(40),
        result: "PASS",
        testedAt: new Date(),
        reference: "fixture-report",
        notes: "Fixture restore evidence for a disposable database.",
      };
      await expect(recordLaunchEvidence(deniedId, value)).rejects.toThrow(
        "FORBIDDEN",
      );
      await expect(
        recordLaunchEvidence(ownerId, {
          ...value,
          testedAt: new Date(Date.now() + 60000),
        }),
      ).rejects.toThrow();
      await recordLaunchEvidence(ownerId, value);
      const row = await db.launchEvidence.findFirstOrThrow({
        where: { origin: value.origin },
      });
      await expect(
        db.launchEvidence.update({
          where: { id: row.id },
          data: { result: "FAIL" },
        }),
      ).rejects.toThrow("append-only");
      await expect(
        db.launchEvidence.delete({ where: { id: row.id } }),
      ).rejects.toThrow("append-only");
    });
    it("delivers a rearmed alert once through the existing provider and marks it complete", async () => {
      const original = await db.siteSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      const env = process.env.EMAIL_PROVIDER;
      try {
        process.env.EMAIL_PROVIDER = "smtp";
        await db.siteSettings.update({
          where: { id: "default" },
          data: {
            seo: { origin: "https://shop.example.com", indexingEnabled: false },
          },
        });
        actor.id = first;
        await db.stockItem.updateMany({
          where: { variantId },
          data: { onHand: 0 },
        });
        await setStockAlert(context(), { variantId, active: true });
        await db.stockItem.updateMany({
          where: { variantId },
          data: { onHand: 2 },
        });
        await scheduleStockAlerts();
        registerStockJobs();
        await runJobs(["stock-alert"]);
        const row = await db.stockAlert.findFirstOrThrow({
          where: { customerId: first, variantId },
        });
        expect(row.active).toBe(false);
        expect(row.notifiedAt).not.toBeNull();
        expect(actor.send).toHaveBeenCalledTimes(1);
        expect(actor.send.mock.calls[0][0]).toMatchObject({
          templateKey: "stock.available",
          idempotencyKey: `stock-${row.id}-${row.generation}`,
        });
        await scheduleStockAlerts();
        await runJobs(["stock-alert"]);
        expect(actor.send).toHaveBeenCalledTimes(1);
      } finally {
        if (env === undefined) delete process.env.EMAIL_PROVIDER;
        else process.env.EMAIL_PROVIDER = env;
        await db.siteSettings.update({
          where: { id: "default" },
          data: {
            seo: original.seo as import("@prisma/client").Prisma.InputJsonValue,
          },
        });
      }
    });
  },
);
