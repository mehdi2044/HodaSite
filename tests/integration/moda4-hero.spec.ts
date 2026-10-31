import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { resolveHeroFloat } from "@/modules/content/moda4-hero";
import {
  heroFloatReferences,
  validateHeroFloats,
} from "@/modules/content/moda4-references";
import { homepageBlocksSchema } from "@/modules/content/homepage";

vi.mock("next-intl/server", () => ({
  getTranslations:
    async () =>
    (_key: string, { price }: { price: string }) =>
      `from ${price}`,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "M4-01 live decorative product references",
  () => {
    it("resolves only a live market/color/price/cutout and validates the saved reference", async () => {
      const market = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      const blocks = homepageBlocksSchema.parse(home.blocks);
      const refs = heroFloatReferences(blocks);
      expect(refs.length).toBe(3);
      const value = await resolveHeroFloat(refs[0], market, "en");
      expect(value?.price).toBeTruthy();
      expect(value?.href).toContain(`/en/m/CA/p/`);
      await db.$transaction((tx) =>
        validateHeroFloats(tx, blocks, [market.id]),
      );
      expect(
        await resolveHeroFloat(
          { ...refs[0], colorId: "not-the-product-color" },
          market,
          "en",
        ),
      ).toBeNull();
      expect(
        await resolveHeroFloat(
          { ...refs[0], productId: "missing-product" },
          market,
          "en",
        ),
      ).toBeNull();
      const invalid = structuredClone(blocks);
      const hero = invalid.find((b) => b.type === "HeroSlider")!;
      if (hero.type !== "HeroSlider") throw new Error("fixture");
      hero.slides[0].float = { ...refs[0], colorId: "not-the-product-color" };
      await expect(
        db.$transaction((tx) => validateHeroFloats(tx, invalid, [market.id])),
      ).rejects.toThrow();
    });
    it("hides stale references after a product is archived without rewriting CMS data", async () => {
      const market = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      const blocks = homepageBlocksSchema.parse(home.blocks),
        ref = heroFloatReferences(blocks)[0];
      const product = await db.product.findUniqueOrThrow({
        where: { id: ref.productId },
      });
      try {
        await db.product.update({
          where: { id: product.id },
          data: { status: "ARCHIVED" },
        });
        expect(await resolveHeroFloat(ref, market, "en")).toBeNull();
        await expect(
          db.$transaction((tx) => validateHeroFloats(tx, blocks, [market.id])),
        ).rejects.toThrow();
        expect(
          (await db.homepage.findUniqueOrThrow({ where: { id: home.id } }))
            .blocks,
        ).toEqual(home.blocks);
      } finally {
        await db.product.update({
          where: { id: product.id },
          data: { status: product.status },
        });
      }
    });
  },
);
