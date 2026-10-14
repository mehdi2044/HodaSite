import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { purgeOne } from "@/modules/media/purge";
import { storage } from "@/modules/integrations/storage";
import {
  saveCatalogCutout,
  archiveCatalogCutout,
} from "@/modules/catalog/cutouts/service";
import {
  storeCutoutModels,
  imageFingerprint,
} from "@/modules/catalog/cutouts/models";
import {
  publicCatalogCutout,
  resolveCutoutPlacement,
} from "@/modules/catalog/cutouts/resolve";
import { transactionBarrier } from "../helpers/transaction-barrier";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { setMaintenanceFlag } from "@/modules/settings";
import {
  saveCategoryPresentation,
  inheritedCategoryPresentation,
} from "@/modules/catalog/category-presentation";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R4 actual transparent media, model geometry and inherited category presentation",
  () => {
    let owner: string,
      marketId: string,
      restricted: string,
      transparentId: string,
      opaqueId: string;
    let models: Awaited<ReturnType<typeof storeCutoutModels>>;
    const medias: string[] = [],
      keys: string[] = [],
      profiles: string[] = [];
    const productId = "seed-style-v2-women-coat",
      colorId = "seed-color-sand";
    beforeAll(async () => {
      setMaintenanceFlag(false);
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      marketId = (await db.market.findUniqueOrThrow({ where: { code: "CA" } }))
        .id;
      const role = await db.role.create({
        data: {
          key: `cutout-fixture-${randomUUID()}`,
          nameI18n: { fa: "مجوز آزمون", tr: "Test", en: "Fixture" },
          permissions: { create: [{ permission: "catalog.product.edit" }] },
        },
      });
      restricted = (
        await db.user.create({
          data: {
            email: `cutout-scope-${randomUUID()}@example.com`,
            name: "Scoped cutout fixture",
            passwordHash: "invalid-test-hash",
            roles: { create: { roleId: role.id, scope: { marketId } } },
          },
        })
      ).id;
      for (const transparent of [true, false]) {
        const canvas = sharp({
          create: {
            width: 48,
            height: 72,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: transparent ? 0 : 1 },
          },
        });
        const garment = await sharp({
          create: {
            width: 24,
            height: 40,
            channels: 4,
            background: { r: 200, g: 120, b: 60, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
        const bytes = await canvas
          .composite([{ input: garment, left: 12, top: 16 }])
          .png()
          .toBuffer();
        const id = `cutout-${randomUUID()}`,
          key = `media/2026/10/${id}.png`;
        const url = await storage.put(key, bytes, "image/png");
        await db.media.create({
          data: {
            id,
            storageKey: key,
            url,
            kind: "image",
            mime: "image/png",
            originalName: "synthetic-cutout-fixture.png",
            width: 48,
            height: 72,
            bytes: bytes.length,
          },
        });
        medias.push(id);
        keys.push(key);
        if (transparent) transparentId = id;
        else opaqueId = id;
      }
      models = await storeCutoutModels();
    });
    afterAll(async () => {
      for (const id of profiles)
        await db.catalogCutout.deleteMany({ where: { id } });
      for (const id of medias)
        await db.media.updateMany({
          where: { id },
          data: { deletedAt: new Date() },
        });
      for (const key of keys) await storage.delete(key);
      if (restricted)
        await db.user.update({
          where: { id: restricted },
          data: { isActive: false },
        });
    });
    const input = async (
      version = 0,
      variantId: string | null = null,
      mediaId = transparentId,
    ) => {
      const media = await db.media.findUniqueOrThrow({
        where: { id: mediaId },
      });
      const currentModels = await storeCutoutModels();
      return {
        productId,
        colorId,
        variantId,
        mediaId,
        slot: "LAYER",
        anchor: null,
        expectedVersion: version,
        confirm: true,
        expectedImageFingerprint: imageFingerprint(media),
        expectedModelFingerprints: currentModels.map((m) => ({
          modelId: m.id,
          fingerprint: m.fingerprint,
        })),
        geometry: {
          version: 1,
          models: currentModels.map((m, index) => ({
            modelId: m.id,
            x: 0.5,
            y: 0.35 + index * 0.03,
            width: 0.35,
            height: 0.4,
            scale: 1,
            rotation: 0,
            zIndex: 10,
          })),
        },
      };
    };
    it("preserves existing search indexes and historical column types in the additive migration", async () => {
      const indexes = await db.$queryRaw<
        { name: string }[]
      >`SELECT indexname AS name FROM pg_indexes WHERE tablename='Product' AND indexname IN ('Product_searchText_trgm_idx','Product_searchVector_idx')`;
      expect(indexes).toHaveLength(2);
      const [column] = await db.$queryRaw<
        { type: string }[]
      >`SELECT data_type AS type FROM information_schema.columns WHERE table_name='Product' AND column_name='createdAt'`;
      expect(column.type).toBe("timestamp with time zone");
    });
    it("rejects opaque photographs, wrong scope/variant and stale image/model snapshots without an audit/write", async () => {
      const before = await db.auditLog.count({
        where: { entityType: "CatalogCutout" },
      });
      await expect(
        saveCatalogCutout(owner, await input(0, null, opaqueId)),
      ).rejects.toThrow();
      await expect(
        saveCatalogCutout(restricted, await input()),
      ).rejects.toThrow();
      await expect(
        saveCatalogCutout(owner, await input(0, "seed-style-v2-men-tee-m")),
      ).rejects.toThrow();
      await expect(
        saveCatalogCutout(owner, {
          ...(await input()),
          expectedImageFingerprint: "0".repeat(64),
        }),
      ).rejects.toBeInstanceOf(RevisionConflictError);
      const stale = await input();
      stale.expectedModelFingerprints[0].fingerprint = "0".repeat(64);
      await expect(saveCatalogCutout(owner, stale)).rejects.toBeInstanceOf(
        RevisionConflictError,
      );
      expect(
        await db.catalogCutout.count({ where: { mediaId: transparentId } }),
      ).toBe(0);
      expect(
        await db.auditLog.count({ where: { entityType: "CatalogCutout" } }),
      ).toBe(before);
    });
    it("rechecks actual media/model edits after a transaction wait without accepting stale visual confirmation", async () => {
      for (const changed of ["cutout", "model"] as const) {
        const payload = await input();
        const barrier = transactionBarrier(
          db,
          "product",
          "findFirst",
          (raw) => (raw as { where?: { id?: string } }).where?.id === productId,
        );
        const before = await db.auditLog.count({
          where: { entityType: "CatalogCutout" },
        });
        const modelImage = models[0].image;
        let write: ReturnType<typeof saveCatalogCutout> | undefined;
        try {
          write = saveCatalogCutout(owner, payload);
          await Promise.race([
            barrier.entered,
            write.then(() => {
              throw Error("writer missed its actual product lock barrier");
            }),
          ]);
          if (changed === "cutout")
            await db.media.update({
              where: { id: transparentId },
              data: { status: "PROCESSING" },
            });
          else
            await db.media.update({
              where: { id: modelImage.id },
              data: { width: modelImage.width! + 1 },
            });
          barrier.release();
          await expect(write).rejects.toThrow();
          expect(
            await db.catalogCutout.count({ where: { mediaId: transparentId } }),
          ).toBe(0);
          expect(
            await db.auditLog.count({ where: { entityType: "CatalogCutout" } }),
          ).toBe(before);
        } finally {
          barrier.release();
          await Promise.allSettled(write ? [write] : []);
          barrier.restore();
          await db.media.update({
            where: { id: transparentId },
            data: { status: "READY" },
          });
          await db.media.update({
            where: { id: modelImage.id },
            data: { width: modelImage.width },
          });
        }
      }
    });
    it("shares one actual color cutout across sizes and projects distinct geometry for all four real models", async () => {
      expect(new Set(models.map((m) => m.kind))).toEqual(
        new Set(["WOMAN", "MAN", "GIRL", "BOY"]),
      );
      const saved = await saveCatalogCutout(owner, await input());
      profiles.push(saved.id);
      for (const variantId of [
        "seed-style-v2-women-coat-m",
        "seed-style-v2-women-coat-l",
      ]) {
        const card = await publicCatalogCutout(variantId, marketId);
        expect(card?.id).toBe(saved.id);
        expect(JSON.stringify(card)).not.toContain("confirmedAt");
        expect(JSON.stringify(card)).not.toContain("contentHash");
        for (const model of models)
          expect(
            (await resolveCutoutPlacement(variantId, marketId, model.id))?.model
              .kind,
          ).toBe(model.kind);
      }
      expect(
        (
          await resolveCutoutPlacement(
            "seed-style-v2-women-coat-m",
            marketId,
            "girl",
          )
        )?.geometry.y,
      ).not.toBe(
        (
          await resolveCutoutPlacement(
            "seed-style-v2-women-coat-m",
            marketId,
            "woman",
          )
        )?.geometry.y,
      );
    });
    it("serializes same-version writes and keeps one immutable audited winner", async () => {
      const row = await db.catalogCutout.findFirstOrThrow({
        where: { mediaId: transparentId, variantId: null },
      });
      const before = await db.auditLog.count({
        where: { entityId: row.id, action: "catalog.cutout.saved" },
      });
      const payload = await input(row.version);
      const results = await Promise.allSettled([
        saveCatalogCutout(owner, payload),
        saveCatalogCutout(owner, payload),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.auditLog.count({
          where: { entityId: row.id, action: "catalog.cutout.saved" },
        }),
      ).toBe(before + 1);
    });
    it("uses an explicit size override, preserves shared fallback on archive, and rejects changed model/image references", async () => {
      const saved = await saveCatalogCutout(
        owner,
        await input(0, "seed-style-v2-women-coat-m"),
      );
      profiles.push(saved.id);
      expect(
        (await publicCatalogCutout("seed-style-v2-women-coat-m", marketId))?.id,
      ).toBe(saved.id);
      expect(
        (await publicCatalogCutout("seed-style-v2-women-coat-l", marketId))?.id,
      ).not.toBe(saved.id);
      await archiveCatalogCutout(owner, saved.id, saved.version);
      expect(
        (await publicCatalogCutout("seed-style-v2-women-coat-m", marketId))?.id,
      ).not.toBe(saved.id);
      const media = await db.media.findUniqueOrThrow({
        where: { id: transparentId },
      });
      try {
        await db.media.update({
          where: { id: media.id },
          data: { status: "PROCESSING" },
        });
        expect(
          await publicCatalogCutout("seed-style-v2-women-coat-m", marketId),
        ).toBe(null);
      } finally {
        await db.media.update({
          where: { id: media.id },
          data: { status: media.status },
        });
      }
      const modelMedia = models[0].image;
      try {
        await db.media.update({
          where: { id: modelMedia.id },
          data: { width: modelMedia.width! + 1 },
        });
        expect(
          await resolveCutoutPlacement(
            "seed-style-v2-women-coat-m",
            marketId,
            models[0].id,
          ),
        ).toBe(null);
      } finally {
        await db.media.update({
          where: { id: modelMedia.id },
          data: { width: modelMedia.width },
        });
      }
    });
    it("retains current, archived and historical cutout/model media through physical purge eligibility", async () => {
      const row = await db.catalogCutout.findFirstOrThrow({
        where: { mediaId: transparentId, variantId: null },
      });
      await db.media.update({
        where: { id: transparentId },
        data: { deletedAt: new Date(Date.now() - 365 * 86400000) },
      });
      try {
        const media = await db.media.findUniqueOrThrow({
          where: { id: transparentId },
        });
        await purgeOne(media, storage);
        expect(
          await db.media.findUnique({ where: { id: transparentId } }),
        ).not.toBe(null);
        await archiveCatalogCutout(owner, row.id, row.version);
        await purgeOne(media, storage);
        expect(
          await db.media.findUnique({ where: { id: transparentId } }),
        ).not.toBe(null);
        // A snapshot remains authoritative even if its live presentation row is
        // removed by scratch-fixture cleanup; never physically lose its media.
        await db.catalogCutout.delete({ where: { id: row.id } });
        await purgeOne(media, storage);
        expect(
          await db.media.findUnique({ where: { id: transparentId } }),
        ).not.toBe(null);
        expect(
          (await storage.getBytes(media.storageKey))?.length,
        ).toBeGreaterThan(0);
      } finally {
        await db.media.update({
          where: { id: transparentId },
          data: { deletedAt: null },
        });
      }
    });
    it("inherits explicit Kids presentation and allows an ordinary child override without title/gender heuristics", async () => {
      const root = await db.category.findUniqueOrThrow({
        where: { id: "seed-category-kids" },
      });
      const child = await db.category.findFirstOrThrow({
        where: { parentId: root.id, deletedAt: null },
      });
      try {
        await saveCategoryPresentation(owner, {
          id: root.id,
          expectedUpdatedAt: root.updatedAt.toISOString(),
          presentation: { version: 1, kind: "kids", tone: "kidsMint" },
        });
        expect(await inheritedCategoryPresentation(child.id)).toMatchObject({
          kind: "kids",
          tone: "kidsMint",
        });
        const current = await db.category.findUniqueOrThrow({
          where: { id: child.id },
        });
        await saveCategoryPresentation(owner, {
          id: child.id,
          expectedUpdatedAt: current.updatedAt.toISOString(),
          presentation: { version: 1, kind: "default" },
        });
        expect(await inheritedCategoryPresentation(child.id)).toMatchObject({
          kind: "default",
        });
        await expect(
          saveCategoryPresentation(owner, {
            id: child.id,
            expectedUpdatedAt: current.updatedAt.toISOString(),
            presentation: null,
          }),
        ).rejects.toBeInstanceOf(RevisionConflictError);
      } finally {
        for (const category of [root, child])
          await db.category.update({
            where: { id: category.id },
            data: {
              presentation:
                category.presentation === null
                  ? Prisma.DbNull
                  : (category.presentation as Prisma.InputJsonValue),
            },
          });
      }
    });
  },
);
