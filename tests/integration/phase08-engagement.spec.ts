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
    it.each(["editor", "delivery"] as const)(
      "serializes stock-alert classification with %s admitted first",
      async (firstOperation) => {
        const integration = await db.integration.findUniqueOrThrow({
          where: { key: "fitting-room" },
        });
        const site = await db.siteSettings.findUniqueOrThrow({
          where: { id: "default" },
        });
        const env = process.env.EMAIL_PROVIDER;
        const source = await db.variant.findUniqueOrThrow({
          where: { id: variantId },
          include: { product: true },
        });
        const id = randomUUID();
        const product = await db.product.create({
          data: {
            categoryId: source.product.categoryId,
            gender: source.product.gender,
            titleI18n: { en: "Unsold classification fixture" },
            slugI18n: { en: id },
            descriptionI18n: {},
            status: "ACTIVE",
            marketIds: [marketId],
            basePriceAmount: "10",
            variants: {
              create: {
                colorId: source.colorId,
                sizeId: source.sizeId,
                sku: `ENG-RACE-${id}`,
              },
            },
          },
          include: { variants: true },
        });
        const variant = product.variants[0];
        const warehouse = await db.warehouse.findFirstOrThrow();
        await db.stockItem.create({
          data: { variantId: variant.id, warehouseId: warehouse.id, onHand: 0 },
        });
        let release!: () => void, notify!: () => void;
        const released = new Promise<void>((resolve) => {
          release = resolve;
        });
        const admitted = new Promise<void>((resolve) => {
          notify = resolve;
        });
        let worker: Promise<unknown> | undefined,
          editor: Promise<unknown> | undefined;
        let jobId: string | undefined;
        actor.send.mockReset().mockResolvedValue({ id: "fixture" });
        try {
          process.env.EMAIL_PROVIDER = "smtp";
          await db.integration.update({
            where: { id: integration.id },
            data: {
              isActive: false,
              config: {
                ...(integration.config as Record<string, unknown>),
                enabled: false,
                coinSalesEnabled: false,
              },
            },
          });
          await db.siteSettings.update({
            where: { id: site.id },
            data: {
              seo: {
                origin: "https://shop.example.com",
                indexingEnabled: false,
              },
            },
          });
          actor.id = first;
          await setStockAlert(context(), {
            variantId: variant.id,
            active: true,
          });
          const alert = await db.stockAlert.findFirstOrThrow({
            where: { customerId: first, variantId: variant.id },
          });
          jobId = `stock-${alert.id}-${alert.generation}`;
          await db.stockItem.updateMany({
            where: { variantId: variant.id },
            data: { onHand: 2 },
          });
          await scheduleStockAlerts();
          registerStockJobs();
          const edit = (hold: boolean) =>
            db.$transaction(
              async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${product.id} FOR UPDATE`;
                await tx.product.update({
                  where: { id: product.id },
                  data: { coinPackCoins: "100" },
                });
                if (hold) {
                  notify();
                  await released;
                }
              },
              { timeout: 30000 },
            );
          if (firstOperation === "editor") {
            editor = edit(true);
            await admitted;
            worker = runJobs(["stock-alert"]);
          } else {
            actor.send.mockImplementationOnce(async () => {
              notify();
              await released;
              return { id: "fixture" };
            });
            worker = runJobs(["stock-alert"]);
            await admitted;
            editor = edit(false);
          }
          await vi.waitFor(async () => {
            const statement =
              firstOperation === "editor"
                ? '%SELECT id FROM "Product" WHERE id=%FOR SHARE%'
                : '%SELECT id FROM "Product" WHERE id=%FOR UPDATE%';
            const rows = await db.$queryRaw<
              { count: bigint }[]
            >`SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${statement}`;
            expect(rows[0].count).toBeGreaterThan(0n);
          });
          release();
          await Promise.all([worker, editor]);
          expect(actor.send).toHaveBeenCalledTimes(
            firstOperation === "editor" ? 0 : 1,
          );
          expect(
            await db.job.findUniqueOrThrow({ where: { id: jobId } }),
          ).toMatchObject(
            firstOperation === "editor"
              ? {
                  status: "PENDING",
                  attempts: 0,
                  lastError: "COIN_PACK_DISABLED",
                }
              : { status: "DONE", attempts: 0 },
          );
          expect(
            await db.stockAlert.findUniqueOrThrow({ where: { id: alert.id } }),
          ).toMatchObject(
            firstOperation === "editor"
              ? { active: true, notifiedAt: null }
              : { active: false },
          );
        } finally {
          release();
          await Promise.allSettled(
            [worker, editor].filter((p) => p !== undefined),
          );
          actor.send.mockReset().mockResolvedValue({ id: "fixture" });
          if (jobId) await db.job.deleteMany({ where: { id: jobId } });
          await db.stockAlert.deleteMany({ where: { variantId: variant.id } });
          await db.stockItem.deleteMany({ where: { variantId: variant.id } });
          await db.variant.delete({ where: { id: variant.id } });
          await db.product.delete({ where: { id: product.id } });
          await db.integration.update({
            where: { id: integration.id },
            data: {
              isActive: integration.isActive,
              config: integration.config!,
            },
          });
          await db.siteSettings.update({
            where: { id: site.id },
            data: { seo: site.seo! },
          });
          if (env === undefined) delete process.env.EMAIL_PROVIDER;
          else process.env.EMAIL_PROVIDER = env;
        }
      },
    );
    it.each([
      { enabled: false, coinSalesEnabled: true },
      { enabled: true, coinSalesEnabled: false },
    ])(
      "defers coin-pack stock alerts under disabled sales without consuming delivery or retry: %j",
      async (off) => {
        const integration = await db.integration.findUniqueOrThrow({
          where: { key: "fitting-room" },
        });
        const site = await db.siteSettings.findUniqueOrThrow({
          where: { id: "default" },
        });
        const env = process.env.EMAIL_PROVIDER;
        const config = integration.config as Record<string, unknown>;
        const enable = (toggles: typeof off) =>
          db.integration.update({
            where: { id: integration.id },
            data: {
              isActive: toggles.enabled,
              config: { ...config, ...toggles },
            },
          });
        let jobId: string | undefined;
        actor.send.mockClear();
        try {
          process.env.EMAIL_PROVIDER = "smtp";
          await db.siteSettings.update({
            where: { id: site.id },
            data: {
              seo: {
                origin: "https://shop.example.com",
                indexingEnabled: false,
              },
            },
          });
          await db.product.update({
            where: { id: productId },
            data: { coinPackCoins: "100" },
          });
          await enable({ enabled: true, coinSalesEnabled: true });
          actor.id = first;
          await db.stockItem.updateMany({
            where: { variantId },
            data: { onHand: 0 },
          });
          await setStockAlert(context(), { variantId, active: true });
          const alert = await db.stockAlert.findFirstOrThrow({
            where: { customerId: first, variantId },
          });
          jobId = `stock-${alert.id}-${alert.generation}`;
          await db.stockItem.updateMany({
            where: { variantId },
            data: { onHand: 2 },
          });
          await enable(off);
          await scheduleStockAlerts();
          expect(await db.job.findUnique({ where: { id: jobId } })).toBeNull();
          await enable({ enabled: true, coinSalesEnabled: true });
          await scheduleStockAlerts();
          expect(await db.job.count({ where: { id: jobId } })).toBe(1);
          await enable(off);
          registerStockJobs();
          await runJobs(["stock-alert"]);
          expect(actor.send).not.toHaveBeenCalled();
          expect(
            await db.job.findUniqueOrThrow({ where: { id: jobId } }),
          ).toMatchObject({
            status: "PENDING",
            attempts: 0,
            lastError: "COIN_PACK_DISABLED",
          });
          expect(
            await db.stockAlert.findUniqueOrThrow({ where: { id: alert.id } }),
          ).toMatchObject({ active: true, notifiedAt: null });
          await enable({ enabled: true, coinSalesEnabled: true });
          await db.job.update({
            where: { id: jobId },
            data: { runAt: new Date(0) },
          });
          await runJobs(["stock-alert"]);
          expect(actor.send).toHaveBeenCalledTimes(1);
          expect(actor.send.mock.calls[0][0]).toMatchObject({
            idempotencyKey: jobId,
          });
          expect(
            await db.job.findUniqueOrThrow({ where: { id: jobId } }),
          ).toMatchObject({ status: "DONE", attempts: 0 });
          await scheduleStockAlerts();
          await runJobs(["stock-alert"]);
          expect(actor.send).toHaveBeenCalledTimes(1);
        } finally {
          await db.integration.update({
            where: { id: integration.id },
            data: {
              isActive: integration.isActive,
              config: integration.config!,
            },
          });
          await db.product.update({
            where: { id: productId },
            data: { coinPackCoins: null },
          });
          await db.siteSettings.update({
            where: { id: site.id },
            data: {
              seo: site.seo as import("@prisma/client").Prisma.InputJsonValue,
            },
          });
          if (env === undefined) delete process.env.EMAIL_PROVIDER;
          else process.env.EMAIL_PROVIDER = env;
          if (jobId) await db.job.deleteMany({ where: { id: jobId } });
        }
      },
    );
  },
);
