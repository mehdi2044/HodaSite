import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import { blockScenes } from "@/modules/content/block-scenes";
import { compositeSceneReferences } from "@/modules/content/scenes/composite";
import { seedFreshModa4Homepage } from "../../prisma/moda4-homepage-seed";
import { sceneReferenceSnapshot } from "@/modules/content/scenes/references";
import { resolveFittingAdLooks } from "@/modules/content/scenes/fitting-ad";
import { fingerprint } from "../helpers/permission-subjects";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3b fresh MODA4 demo preserves existing merchant rows",
  () => {
    it("never touches any merchant data or files when bootstrap is not fresh", async () => {
      const tables = [
        "Homepage",
        "Category",
        "Media",
        "CatalogCutout",
        "Product",
        "Variant",
        "Market",
        "ThemeSettings",
        "Order",
        "Integration",
      ];
      const before = await fingerprint(tables);
      const put = vi.fn();
      await seedFreshModa4Homepage(db, put, false);
      expect(put).not.toHaveBeenCalled();
      expect(await fingerprint(tables)).toEqual(before);
    });
    it("a fresh demo has complete CMS blocks and actual valid composition identities for all four models", async () => {
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      expect(
        (
          await db.category.findUniqueOrThrow({
            where: { id: "seed-category-kids" },
          })
        ).presentation,
      ).toEqual({ version: 1, kind: "kids", tone: "kidsMint" });
      const blocks = homepageBlocksSchema.parse(home.blocks);
      expect(blocks.map((block) => block.type)).toEqual([
        "HeroSlider",
        "Bands",
        "WorldsPrism",
        "NewIn",
        "FittingAd",
        "ShopLook",
        "Lookbook",
        "KidsWorld",
        "Services",
      ]);
      const scenes = blockScenes(blocks);
      expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length);
      expect(
        new Set(
          scenes
            .filter((scene) => scene.mode === "COMPOSITE")
            .map((scene) => scene.modelId),
        ),
      ).toEqual(new Set(["woman", "man", "girl", "boy"]));
      for (const market of await db.market.findMany({
        where: { code: { in: ["IR", "TR", "CA"] } },
      }))
        for (const scene of scenes) {
          if (scene.mode === "COMPOSITE") {
            const result = await compositeSceneReferences(scene, market.id);
            expect(result.pieces).toHaveLength(scene.pieces.length);
          } else {
            const snapshot = await sceneReferenceSnapshot(scene, [market.id]);
            expect(snapshot.fingerprint).toBe(scene.match?.fingerprint);
            expect(snapshot.images.length).toBeGreaterThanOrEqual(3);
          }
        }
    }, 30000);
    it("previews the exact unconfirmed fitting photo privately and rejects stale or mismatched approval", async () => {
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      const blocks = homepageBlocksSchema.parse(home.blocks);
      const ad = blocks.find((block) => block.type === "FittingAd");
      const city = ad?.looks[0];
      if (!city) throw Error("Missing seeded fitting look");
      const portrait = "seed-fashion-v2-look-women-knit";
      const source = blockScenes(blocks).find(
        (scene) => scene.mode === "PHOTO" && scene.mobile.mediaId === portrait,
      );
      if (!source) throw Error("Missing Soft Forms photo");
      const ir = await db.market.findUniqueOrThrow({ where: { code: "IR" } });
      const photo = {
        ...source,
        id: "test-city-final-photo",
        desktop: { ...source.desktop, mediaId: portrait },
        match: undefined,
      };
      const resolve = (finalPhoto: typeof source, adminPreview = true) =>
        resolveFittingAdLooks([{ ...city, finalPhoto }], ir.id, "fa", {
          adminPreview,
        });
      const initial = await resolve(photo);
      expect(initial.photoPreviews).toEqual([
        expect.objectContaining({
          id: photo.id,
          references: expect.arrayContaining(
            photo.pieces.map((piece) =>
              expect.objectContaining({ id: piece.id }),
            ),
          ),
        }),
      ]);
      expect(initial.animated[0].photo).toBeNull();
      expect((await resolve(photo, false)).photoPreviews).toEqual([]);
      const confirmed = {
        ...photo,
        match: {
          fingerprint: initial.photoPreviews[0].fingerprint,
          confirmedAt: new Date().toISOString(),
        },
      };
      expect(
        (await resolve(confirmed, false)).animated[0].photo,
      ).not.toBeNull();
      const switched = await resolve({ ...confirmed, desktop: source.desktop });
      expect(switched.animated[0].photo).toBeNull();
      expect(switched.photoPreviews[0].fingerprint).not.toBe(
        confirmed.match.fingerprint,
      );
      const piece = photo.pieces[0];
      const variant = await db.variant.findFirstOrThrow({
        where: {
          productId: piece.productId,
          colorId: piece.colorId,
          isActive: true,
        },
      });
      const changed = {
        ...confirmed,
        pieces: [
          { ...piece, preferredVariantId: variant.id },
          ...photo.pieces.slice(1),
        ],
      };
      const mismatch = await resolve(changed);
      expect(mismatch.animated[0].photo).toBeNull();
      expect(mismatch.photoPreviews).toEqual([]);
      expect(mismatch.diagnostics[0].reason).toBe("PHOTO_MISMATCH");
      expect(
        (await sceneReferenceSnapshot(changed, [ir.id])).fingerprint,
      ).not.toBe(confirmed.match.fingerprint);
    }, 30000);
    it("binds every seeded fitting look to its live geometry and isolates invalid looks or final photos", async () => {
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      const blocks = homepageBlocksSchema.parse(home.blocks);
      const ad = blocks.find((block) => block.type === "FittingAd");
      const hero = blocks.find((block) => block.type === "HeroSlider");
      if (!ad || !hero) throw Error("Missing seeded cinematic fixture");
      for (const market of await db.market.findMany({
        where: { code: { in: ["IR", "TR", "CA"] } },
      })) {
        const result = await resolveFittingAdLooks(ad.looks, market.id, "en");
        expect(result.diagnostics).toEqual([]);
        expect(result.animated.map((look) => look.pieces.length)).toEqual([
          3, 3, 3, 2,
        ]);
        expect(
          result.animated.every((look) =>
            look.pieces.every((piece) => piece.target.visible),
          ),
        ).toBe(true);
        for (const look of ad.looks) {
          const snapshot = await sceneReferenceSnapshot(look.scene, [
            market.id,
          ]);
          expect(look.scene.match?.fingerprint).toBe(snapshot.fingerprint);
        }
      }
      const ir = await db.market.findUniqueOrThrow({ where: { code: "IR" } });
      const [a, b] = ad.looks;
      const photo = hero.slides[0].scene;
      const stale = { ...a, scene: { ...a.scene, match: undefined } };
      const partial = await resolveFittingAdLooks(
        [stale, { ...b, finalPhoto: photo }],
        ir.id,
        "fa",
      );
      expect(partial.animated.map((look) => look.id)).toEqual([b.id]);
      expect(partial.animated[0].photo).toBeNull();
      expect(partial.diagnostics.map(({ reason }) => reason)).toEqual([
        "MATCH_REQUIRED",
        "PHOTO_MISMATCH",
      ]);
      const empty = await resolveFittingAdLooks([stale], ir.id, "fa");
      expect(empty.animated).toEqual([]);
      expect(empty.staticPhoto).toBeNull();
      const staticOnly = await resolveFittingAdLooks(
        [{ ...a, scene: photo }],
        ir.id,
        "fa",
      );
      expect(staticOnly.animated).toEqual([]);
      expect(staticOnly.staticPhoto).not.toBeNull();
    }, 30000);
  },
);
