import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { setMaintenanceFlag } from "@/modules/settings";
import {
  purgeOne,
  MEDIA_PURGE_OBJECTS_JOB,
  mediaPurgeHandler,
  ensurePurgeSweepScheduled,
} from "@/modules/media/purge";
import { lockMediaReferences } from "@/modules/media/reference-lock";
import type { StorageProvider } from "@/modules/integrations/storage";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "purge commit boundary and references",
  () => {
    const prefix = "purge-safety-" + randomUUID();
    const files = new Map<string, Buffer>();
    let deleted: string[] = [];
    let failure: string | undefined;
    let productId: string,
      variantId: string,
      categoryId: string,
      colorId: string,
      sizeId: string;
    const ids: string[] = [];
    const target: StorageProvider = {
      async put(key, bytes) {
        files.set(key, bytes);
        return "/media/" + key;
      },
      async getBytes(key) {
        return files.get(key) ?? null;
      },
      async getSignedUrl(key) {
        return "/media/" + key;
      },
      async delete(key) {
        if (key === failure) throw new Error("injected storage failure");
        deleted.push(key);
        files.delete(key);
      },
    };
    beforeAll(async () => {
      setMaintenanceFlag(false);
      const category = await db.category.create({
        data: { slugI18n: { en: prefix }, titleI18n: {}, gender: "UNISEX" },
      });
      categoryId = category.id;
      const product = await db.product.create({
        data: {
          categoryId,
          slugI18n: { en: prefix },
          titleI18n: {},
          descriptionI18n: {},
          gender: "UNISEX",
          basePriceAmount: 10,
        },
      });
      productId = product.id;
      colorId = (
        await db.color.create({
          data: { code: prefix, nameI18n: {}, hex: "#000000" },
        })
      ).id;
      sizeId = (
        await db.size.create({
          data: { scale: "INTL", value: prefix, groupKey: prefix },
        })
      ).id;
      variantId = (
        await db.variant.create({
          data: { productId, colorId, sizeId, sku: prefix },
        })
      ).id;
    });
    afterEach(async () => {
      failure = undefined;
      await db.productMedia.deleteMany({ where: { mediaId: { in: ids } } });
      await db.variantMedia.deleteMany({ where: { mediaId: { in: ids } } });
      await db.category.update({
        where: { id: categoryId },
        data: { mediaId: null },
      });
      await db.color.update({
        where: { id: colorId },
        data: { swatchMediaId: null },
      });
      await db.themeSettings.deleteMany({ where: { id: prefix } });
      await db.page.deleteMany({ where: { id: { startsWith: prefix } } });
      await db.homepage.deleteMany({ where: { id: { startsWith: prefix } } });
      await db.media.deleteMany({
        where: { id: { in: ids }, kind: { in: ["image", "document"] } },
      });
      await db.job.deleteMany({
        where: { id: { in: ids.map((id) => `media-purge-objects:${id}`) } },
      });
      ids.length = 0;
      files.clear();
      deleted = [];
    });
    afterAll(async () => {
      await db.variant.delete({ where: { id: variantId } });
      await db.product.delete({ where: { id: productId } });
      await db.category.delete({ where: { id: categoryId } });
      await db.color.delete({ where: { id: colorId } });
      await db.size.delete({ where: { id: sizeId } });
    });
    async function fixture(kind = "image") {
      const id = prefix + "-" + randomUUID();
      const key = `media/test/${id}.jpg`;
      const variant = `media/test/${id}.webp`;
      files.set(key, Buffer.from("original"));
      files.set(variant, Buffer.from("rendition"));
      const media = await db.media.create({
        data: {
          id,
          kind,
          storageKey: key,
          originalName: prefix,
          url: "/media/" + key,
          bytes: 8,
          mime: "image/jpeg",
          deletedAt: new Date(Date.now() - 40 * 86_400_000),
          variants: {
            webp: {
              "320": { key: variant, url: "/media/" + variant, bytes: 9 },
            },
          },
        },
      });
      ids.push(id);
      return { media, variant };
    }
    it("deletes unreferenced soft-deleted media after commit, and repeats idempotently", async () => {
      const { media } = await fixture();
      await purgeOne(media, target);
      await purgeOne(media, target);
      expect(await db.media.findUnique({ where: { id: media.id } })).toBeNull();
      expect(deleted).toHaveLength(2);
      expect(
        (
          await db.job.findUniqueOrThrow({
            where: { id: `media-purge-objects:${media.id}` },
          })
        ).status,
      ).toBe("DONE");
    });
    for (const relation of [
      "product",
      "variant",
      "category",
      "swatch",
      "brand",
      "page",
      "homepage",
    ])
      it(`retains soft-deleted media used by ${relation}, including draft/trash JSON`, async () => {
        const { media } = await fixture();
        if (relation === "product")
          await db.productMedia.create({
            data: { productId, mediaId: media.id },
          });
        if (relation === "variant")
          await db.variantMedia.create({
            data: { variantId, mediaId: media.id },
          });
        if (relation === "category")
          await db.category.update({
            where: { id: categoryId },
            data: { mediaId: media.id },
          });
        if (relation === "swatch")
          await db.color.update({
            where: { id: colorId },
            data: { swatchMediaId: media.id },
          });
        if (relation === "brand")
          await db.themeSettings.create({
            data: { id: prefix, logoMediaId: media.id, colors: {}, fonts: {} },
          });
        if (relation === "page")
          await db.page.create({
            data: {
              id: prefix,
              titleI18n: {},
              slugI18n: {},
              blocks: [{ type: "Image", mediaId: media.id }],
              deletedAt: new Date(),
            },
          });
        if (relation === "homepage")
          await db.homepage.create({
            data: {
              id: prefix,
              blocks: [{ type: "Hero", mediaId: media.id }],
              deletedAt: new Date(),
            },
          });
        await purgeOne(media, target);
        expect(deleted).toEqual([]);
        expect(
          await db.media.findUnique({ where: { id: media.id } }),
        ).not.toBeNull();
      });
    it.each(["receipt", "invoice", "expense", "backup", "review-photo"])(
      "does not purge private kind %s even with public-looking key",
      async (kind) => {
        const { media } = await fixture(kind);
        await purgeOne(media, target);
        expect(deleted).toEqual([]);
      },
    );
    it("rolls back deletion if persisting the cleanup intent fails", async () => {
      const { media } = await fixture();
      await db.job.create({
        data: {
          id: `media-purge-objects:${media.id}`,
          type: MEDIA_PURGE_OBJECTS_JOB,
        },
      });
      await expect(purgeOne(media, target)).rejects.toThrow();
      expect(deleted).toEqual([]);
      expect(
        await db.media.findUnique({ where: { id: media.id } }),
      ).not.toBeNull();
    });
    it("retains exact cleanup keys through partial storage failure and retries", async () => {
      const { media, variant } = await fixture();
      failure = variant;
      await expect(purgeOne(media, target)).rejects.toThrow(
        "injected storage failure",
      );
      expect(files.has(media.storageKey)).toBe(false);
      expect(files.has(variant)).toBe(true);
      expect(await db.media.findUnique({ where: { id: media.id } })).toBeNull();
      const intent = await db.job.findUniqueOrThrow({
        where: { id: `media-purge-objects:${media.id}` },
      });
      expect(intent.payload).toEqual({
        mediaId: media.id,
        keys: [media.storageKey, variant],
      });
      failure = undefined;
      await purgeOne(media, target);
      expect(files.size).toBe(0);
    });
    for (const kind of ["fk", "json"])
      it(`waits for a concurrent ${kind} reference writer and retains files`, async () => {
        const { media } = await fixture();
        let ready!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const writer = db.$transaction(async (tx) => {
          if (kind === "fk")
            await tx.productMedia.create({
              data: { productId, mediaId: media.id },
            });
          else {
            await lockMediaReferences(tx, [media.id]);
            await tx.homepage.create({
              data: {
                id: prefix,
                blocks: [{ type: "Hero", mediaId: media.id }],
              },
            });
          }
          ready();
          await gate;
        });
        await entered;
        const purge = purgeOne(media, target);
        release();
        await Promise.all([writer, purge]);
        expect(deleted).toEqual([]);
        expect(
          await db.media.findUnique({ where: { id: media.id } }),
        ).not.toBeNull();
      });
    it("rejects both FK and JSON reference creation when purge commits first", async () => {
      const { media } = await fixture();
      await purgeOne(media, target);
      await expect(
        db.productMedia.create({ data: { productId, mediaId: media.id } }),
      ).rejects.toThrow();
      await expect(
        db.$transaction((tx) => lockMediaReferences(tx, [media.id])),
      ).rejects.toThrow();
    });
    it("the sweep protects references and re-arms failed cleanup", async () => {
      const { media } = await fixture();
      await db.productMedia.create({ data: { productId, mediaId: media.id } });
      await db.job.create({
        data: {
          id: `media-purge-objects:${media.id}`,
          type: MEDIA_PURGE_OBJECTS_JOB,
          status: "FAILED",
          attempts: 3,
          payload: { mediaId: media.id, keys: [media.storageKey] },
        },
      });
      await mediaPurgeHandler();
      expect(
        await db.media.findUnique({ where: { id: media.id } }),
      ).not.toBeNull();
      expect(
        (
          await db.job.findUniqueOrThrow({
            where: { id: `media-purge-objects:${media.id}` },
          })
        ).status,
      ).toBe("PENDING");
    });
    it("reconciles a missing sweep after previous work failed", async () => {
      await db.job.deleteMany({ where: { type: "media-purge" } });
      await ensurePurgeSweepScheduled();
      await db.job.updateMany({
        where: { type: "media-purge" },
        data: { status: "FAILED" },
      });
      await ensurePurgeSweepScheduled();
      expect(
        await db.job.count({
          where: { type: "media-purge", status: "PENDING" },
        }),
      ).toBe(1);
      await db.job.deleteMany({ where: { type: "media-purge" } });
    });
  },
);
