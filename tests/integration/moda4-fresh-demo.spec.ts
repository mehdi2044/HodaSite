import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import { blockScenes } from "@/modules/content/block-scenes";
import { compositeSceneReferences } from "@/modules/content/scenes/composite";
import { seedFreshModa4Homepage } from "../../prisma/moda4-homepage-seed";
import { fingerprint } from "../helpers/permission-subjects";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3b fresh MODA4 demo preserves existing merchant rows",
  () => {
    it("never touches any merchant data or files when bootstrap is not fresh", async () => {
      const tables = [
        "Homepage",
        "Media",
        "CatalogCutout",
        "Product",
        "Variant",
        "Market",
        "ThemeSettings",
        "Order",
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
      expect(new Set(scenes.map((scene) => scene.modelId))).toEqual(
        new Set(["woman", "man", "girl", "boy"]),
      );
      for (const market of await db.market.findMany({
        where: { code: { in: ["IR", "TR", "CA"] } },
      }))
        for (const scene of scenes) {
          const result = await compositeSceneReferences(scene, market.id);
          expect(result.pieces).toHaveLength(scene.pieces.length);
        }
    }, 30000);
  },
);
