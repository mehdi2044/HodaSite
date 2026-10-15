import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/secure-tokens";
import { storage } from "@/modules/integrations/storage";
import { setMaintenanceFlag } from "@/modules/settings";
import { saveCatalogCutout } from "@/modules/catalog/cutouts/service";
import {
  imageFingerprint,
  storeCutoutModels,
} from "@/modules/catalog/cutouts/models";
import {
  saveHomepageDraft,
  publishHomepageRevision,
} from "@/modules/content/publication";
import { resolveShoppableScene } from "@/modules/content/scenes/resolve";
import { shoppableSceneSchema } from "@/modules/content/scenes/contracts";
import { sceneReferenceFingerprint } from "@/modules/content/scenes/references";
import { transactionBarrier } from "../helpers/transaction-barrier";
const state = vi.hoisted(() => ({
  token: "",
  market: {} as { id: string; currency: string },
}));
vi.mock("@/modules/auth", () => ({ auth: async () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.token }), set: vi.fn() }),
}));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({ market: state.market }),
}));
vi.mock("next/cache", () => ({
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
import { addShoppableScene } from "@/modules/content/scenes/purchase";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3b actual cutout/model scene publication and exact-size atomic cart",
  () => {
    let ownerId = "",
      cartId = "",
      homeId = "";
    let market: Awaited<ReturnType<typeof db.market.findUniqueOrThrow>>;
    let previous: Awaited<ReturnType<typeof db.homepage.findFirst>>;
    let models: Awaited<ReturnType<typeof storeCutoutModels>>;
    const mediaIds: string[] = [],
      keys: string[] = [],
      profiles: string[] = [];
    const variants: string[] = [];
    const products: string[] = [];
    let scene: ReturnType<typeof shoppableSceneSchema.parse>;
    const text = { fa: "ترکیب آزمون", tr: "Deneme", en: "Fixture composition" };
    const blocks = () => [
      { type: "Hero", title: text, body: text, ctaLabel: text, scene },
    ];
    async function saveAndPublish() {
      const row = await db.homepage.findFirst({
        where: { marketId: market.id, deletedAt: null },
      });
      const saved = await saveHomepageDraft(ownerId, {
        marketId: market.id,
        expectedVersion: row?.version ?? 0,
        blocks: blocks(),
      });
      homeId = saved.id;
      await publishHomepageRevision(ownerId, {
        homepageId: saved.id,
        revisionId: saved.revisionId,
        expectedVersion: saved.version,
      });
      const published = await db.homepage.findUniqueOrThrow({
        where: { id: homeId },
      });
      return shoppableSceneSchema.parse(
        (published.blocks as unknown as { scene: unknown }[])[0].scene,
      );
    }
    beforeAll(async () => {
      setMaintenanceFlag(false);
      market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
      state.market = market;
      ownerId = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      previous = await db.homepage.findFirst({
        where: { marketId: market.id },
      });
      for (const seedId of [
        "seed-style-v2-women-coat-m",
        "seed-style-v2-women-trousers-m",
      ]) {
        const original = await db.variant.findUniqueOrThrow({
          where: { id: seedId },
          include: { product: true, stockItems: true },
        });
        const identity = `composite-product-${randomUUID()}`;
        await db.product.create({
          data: {
            id: identity,
            slugI18n: { fa: identity, tr: identity, en: identity },
            titleI18n: text,
            descriptionI18n: text,
            categoryId: original.product.categoryId,
            gender: original.product.gender,
            status: "ACTIVE",
            basePriceAmount: original.product.basePriceAmount,
            basePriceCurrency: original.product.basePriceCurrency,
            fittingSlot: original.product.fittingSlot,
            marketIds: [market.id],
          },
        });
        const variant = await db.variant.create({
          data: {
            productId: identity,
            colorId: original.colorId,
            sizeId: original.sizeId,
            sku: identity,
            isActive: true,
          },
        });
        await db.stockItem.create({
          data: {
            variantId: variant.id,
            warehouseId: original.stockItems[0].warehouseId,
            onHand: 10,
            reserved: 0,
          },
        });
        products.push(identity);
        variants.push(variant.id);
      }
      models = await storeCutoutModels();
      expect(new Set(models.map((model) => model.kind))).toEqual(
        new Set(["WOMAN", "MAN", "GIRL", "BOY"]),
      );
      for (const name of ["women-coat", "women-trousers", "women-coat"]) {
        const bytes = await readFile(
          path.join(
            process.cwd(),
            "docs/design/moda4-redesign/assets/cutouts",
            name + ".webp",
          ),
        );
        const metadata = await sharp(bytes).metadata(),
          id = `composite-${randomUUID()}`,
          key = `media/2026/10/${id}.webp`;
        const url = await storage.put(key, bytes, "image/webp");
        await db.media.create({
          data: {
            id,
            storageKey: key,
            url,
            kind: "image",
            mime: "image/webp",
            originalName: `demo-composite-fixture-${name}.webp`,
            width: metadata.width,
            height: metadata.height,
            bytes: bytes.length,
          },
        });
        mediaIds.push(id);
        keys.push(key);
      }
      for (const [n, variantId] of variants.entries()) {
        const v = await db.variant.findUniqueOrThrow({
          where: { id: variantId },
          include: { product: true },
        });
        const image = await db.media.findUniqueOrThrow({
          where: { id: mediaIds[n] },
        });
        const saved = await saveCatalogCutout(ownerId, {
          productId: v.productId,
          colorId: v.colorId,
          variantId: null,
          mediaId: image.id,
          slot: v.product.fittingSlot,
          anchor: null,
          geometry: {
            version: 1,
            models: models.map((model, index) => ({
              modelId: model.id,
              x: 0.5,
              y: n === 0 ? 0.35 + index * 0.01 : 0.65,
              width: 0.4 + index * 0.01,
              height: 0.4,
              scale: 1,
              rotation: 0,
              zIndex: n,
            })),
          },
          expectedVersion: 0,
          confirm: true,
          expectedImageFingerprint: imageFingerprint(image),
          expectedModelFingerprints: models.map((model) => ({
            modelId: model.id,
            fingerprint: model.fingerprint,
          })),
        });
        profiles.push(saved.id);
      }
      const model = models.find((model) => model.kind === "WOMAN")!;
      scene = shoppableSceneSchema.parse({
        version: 1,
        id: "composite-fixture-scene",
        mode: "COMPOSITE",
        modelId: model.id,
        title: text,
        alt: text,
        desktop: { mediaId: model.mediaId },
        mobile: { mediaId: model.mediaId },
        pieces: await Promise.all(
          variants.map(async (variantId, index) => {
            const v = await db.variant.findUniqueOrThrow({
              where: { id: variantId },
            });
            return {
              id: `composite-piece-${index}`,
              productId: v.productId,
              colorId: v.colorId,
              preferredVariantId: v.id,
              referenceMediaId: mediaIds[index],
              desktop: { x: 0.5, y: 0.35 + index * 0.3 },
              mobile: { x: 0.5, y: 0.35 + index * 0.3 },
            };
          }),
        ),
      });
      scene = await saveAndPublish();
      state.token = `composite-${randomUUID()}`;
      cartId = (
        await db.cart.create({
          data: {
            tokenHash: tokenHash(state.token),
            marketId: market.id,
            currency: market.currency,
            locale: "en",
            expiresAt: new Date(Date.now() + 86400000),
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (cartId) await db.cart.delete({ where: { id: cartId } });
      if (previous) {
        const { id, createdAt, updatedAt, ...rest } = previous;
        void createdAt;
        void updatedAt;
        await db.homepage.update({
          where: { id },
          data: {
            ...rest,
            blocks: rest.blocks as Prisma.InputJsonValue,
            draftBlocks:
              rest.draftBlocks === null
                ? Prisma.DbNull
                : (rest.draftBlocks as Prisma.InputJsonValue),
          },
        });
      } else if (homeId) await db.homepage.delete({ where: { id: homeId } });
      // Immutable audit references are retained in this owned scratch DB.
      for (const id of profiles)
        await db.catalogCutout.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      await db.product.updateMany({
        where: { id: { in: products } },
        data: { deletedAt: new Date() },
      });
      void keys;
    });
    it("binds real model/cutout geometry and Decimal variant prices without exposing confirmation data", async () => {
      const view = await resolveShoppableScene(scene, market, "en");
      expect(view.reason).toBeNull();
      expect(view.pieces).toHaveLength(2);
      expect(view.desktop.media?.url).toBe(
        models.find((model) => model.kind === "WOMAN")!.image.url,
      );
      expect(view.pieces[0].layer?.media.url).toBe(
        (await db.media.findUniqueOrThrow({ where: { id: mediaIds[0] } })).url,
      );
      expect(
        view.pieces[0].variants.some((v) => v.amount !== null && v.layer),
      ).toBe(true);
      const dto = JSON.stringify(view);
      expect(dto).not.toContain("fingerprint");
      expect(dto).not.toContain(ownerId);
      for (const model of models) {
        const current = {
          ...scene,
          modelId: model.id,
          desktop: { ...scene.desktop, mediaId: model.mediaId },
          mobile: { ...scene.mobile, mediaId: model.mediaId },
        };
        const hash = await sceneReferenceFingerprint(current, [market.id]);
        const ownView = await resolveShoppableScene(
          {
            ...current,
            match: { fingerprint: hash, confirmedAt: new Date().toISOString() },
          },
          market,
          "en",
        );
        expect(ownView.reason).toBeNull();
        expect(ownView.pieces[0].layer?.geometry.modelId).toBe(model.id);
      }
    });
    it("rejects incomplete/unrelated sizes with no partial write, then adds the exact complete batch", async () => {
      for (const variantIds of [
        [variants[0]],
        [variants[0], "seed-style-v2-women-tee-charcoal-m"],
      ])
        await expect(
          addShoppableScene("en", { sceneId: scene.id, variantIds }),
        ).rejects.toThrow();
      expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
      await addShoppableScene("en", {
        sceneId: scene.id,
        variantIds: variants,
      });
      expect(
        (
          await db.cartItem.findMany({
            where: { cartId },
            orderBy: { variantId: "asc" },
          })
        ).map((item) => item.variantId),
      ).toEqual([...variants].sort());
    });
    it("switches the exact-size override geometry/pixels together and keeps price-only edits independent of the match", async () => {
      const base = await db.variant.findUniqueOrThrow({
        where: { id: variants[0] },
        include: { stockItems: true },
      });
      const otherSize = (
        await db.variant.findUniqueOrThrow({
          where: { id: "seed-style-v2-women-coat-l" },
        })
      ).sizeId;
      const override = await db.variant.create({
        data: {
          productId: base.productId,
          colorId: base.colorId,
          sizeId: otherSize,
          sku: `composite-override-${randomUUID()}`,
          priceOverrideUsd: "130.0001",
          isActive: true,
        },
      });
      await db.stockItem.create({
        data: {
          variantId: override.id,
          warehouseId: base.stockItems[0].warehouseId,
          onHand: 5,
          reserved: 0,
        },
      });
      const image = await db.media.findUniqueOrThrow({
        where: { id: mediaIds[2] },
      });
      const saved = await saveCatalogCutout(ownerId, {
        productId: base.productId,
        colorId: base.colorId,
        variantId: override.id,
        mediaId: image.id,
        slot: "LAYER",
        anchor: null,
        geometry: {
          version: 1,
          models: models.map((model) => ({
            modelId: model.id,
            x: 0.6,
            y: 0.36,
            width: 0.43,
            height: 0.4,
            scale: 1,
            rotation: 12,
            zIndex: 2,
          })),
        },
        expectedVersion: 0,
        confirm: true,
        expectedImageFingerprint: imageFingerprint(image),
        expectedModelFingerprints: models.map((model) => ({
          modelId: model.id,
          fingerprint: model.fingerprint,
        })),
      });
      profiles.push(saved.id);
      // The same approved demo source is stored independently: this verifies reference
      // and geometry switching, not a visual claim about merchant size artwork.
      expect((await resolveShoppableScene(scene, market, "en")).reason).toBe(
        "MATCH_REQUIRED",
      );
      scene = await saveAndPublish();
      const view = await resolveShoppableScene(scene, market, "en");
      expect(view.reason).toBeNull();
      const selected = view.pieces[0].variants.find(
        (v) => v.id === override.id,
      )!;
      expect(selected.layer?.media.url).toBe(image.url);
      expect(selected.layer?.geometry.rotation).toBe(12);
      expect(view.pieces[0].layer?.media.url).not.toBe(image.url);
      const fingerprint = await sceneReferenceFingerprint(scene, [market.id]);
      await db.variant.update({
        where: { id: override.id },
        data: { priceOverrideUsd: "131.0001" },
      });
      const repriced = await resolveShoppableScene(scene, market, "en");
      expect(repriced.reason).toBeNull();
      expect(await sceneReferenceFingerprint(scene, [market.id])).toBe(
        fingerprint,
      );
      expect(
        repriced.pieces[0].variants.find((v) => v.id === override.id)!.amount,
      ).not.toBe(selected.amount);
      await addShoppableScene("en", {
        sceneId: scene.id,
        variantIds: [override.id, variants[1]],
      });
      expect(
        await db.cartItem.findFirst({
          where: { cartId, variantId: override.id },
        }),
      ).not.toBeNull();
    });
    it("revalidates model pixels after a real Media lock wait and never persists a stale draft", async () => {
      const model = models.find((model) => model.kind === "WOMAN")!;
      const before = await db.homepage.findUniqueOrThrow({
        where: { id: homeId },
      });
      let announce!: () => void, unblock!: () => void;
      const arrived = new Promise<void>((resolve) => {
        announce = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        unblock = resolve;
      });
      const barrier = transactionBarrier(
        db,
        "homepage",
        "findUniqueOrThrow",
        (raw) => (raw as { where?: { id?: string } }).where?.id === homeId,
      );
      const holding = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Media" WHERE id=${model.mediaId} FOR UPDATE`;
          announce();
          await gate;
          await tx.media.update({
            where: { id: model.mediaId },
            data: { width: model.image.width! + 1 },
          });
        },
        { timeout: 15000 },
      );
      await arrived;
      const saving = saveHomepageDraft(ownerId, {
        marketId: market.id,
        expectedVersion: before.version,
        blocks: blocks(),
      });
      const rejected = expect(saving).rejects.toThrow();
      try {
        await barrier.entered;
        barrier.release();
        let blocked = false;
        for (let turn = 0; turn < 100; turn++) {
          const [wait] = await db.$queryRaw<
            { blocked: boolean }[]
          >`SELECT cardinality(pg_blocking_pids(${barrier.pid}::int)) > 0 AS blocked`;
          if (wait.blocked) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
        unblock();
        await holding;
        await rejected;
        expect(
          (await db.homepage.findUniqueOrThrow({ where: { id: homeId } }))
            .version,
        ).toBe(before.version);
      } finally {
        barrier.release();
        barrier.restore();
        unblock();
        await Promise.allSettled([holding, saving]);
        await db.media.update({
          where: { id: model.mediaId },
          data: { width: model.image.width },
        });
      }
    });
    it("invalidates changed cutout pixels and rejects atomic purchase without changing existing items", async () => {
      const before = await db.cart.findUniqueOrThrow({
        where: { id: cartId },
        include: { items: true },
      });
      const image = await db.media.findUniqueOrThrow({
        where: { id: mediaIds[0] },
      });
      await db.media.update({
        where: { id: image.id },
        data: { status: "PROCESSING" },
      });
      try {
        expect((await resolveShoppableScene(scene, market, "en")).reason).toBe(
          "INVALID_REFERENCE",
        );
        await expect(
          addShoppableScene("en", { sceneId: scene.id, variantIds: variants }),
        ).rejects.toThrow();
        const after = await db.cart.findUniqueOrThrow({
          where: { id: cartId },
          include: { items: true },
        });
        expect(after.revision).toBe(before.revision);
        expect(after.items).toEqual(before.items);
      } finally {
        await db.media.update({
          where: { id: image.id },
          data: { status: "READY" },
        });
      }
    });
  },
);
