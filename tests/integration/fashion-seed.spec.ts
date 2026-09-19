import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { upgradeDemoComposition } from "../../prisma/fashion-seed";
import { legacyHomepageBlocks } from "../../prisma/demo-homepage";
import type { Prisma } from "@prisma/client";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "demo storefront upgrade preserves merchant content",
  () => {
    it("upgrades legacy links once, retaining edited photos, titles, blocks and original media", async () => {
      const products = await db.product.findMany({
        where: {
          id: { in: ["seed-product-1", "seed-product-2", "seed-product-3"] },
        },
        include: { media: true },
      });
      const categories = await db.category.findMany({
        where: { id: { in: ["seed-category-women", "seed-category-men"] } },
      });
      const home = await db.homepage.findUniqueOrThrow({
        where: { id: "seed-homepage-global" },
      });
      const old = await db.media.findFirstOrThrow({
        where: { originalName: "seed-محصولات-1.jpg" },
      });
      const custom = await db.media.create({
        data: {
          kind: "image",
          originalName: "merchant-photo.webp",
          storageKey: `test-fashion-${Date.now()}.webp`,
          url: "/merchant-photo.webp",
          bytes: 10,
          mime: "image/webp",
          status: "READY",
        },
      });
      try {
        for (const p of products) {
          await db.productMedia.deleteMany({ where: { productId: p.id } });
          await db.productMedia.create({
            data: {
              productId: p.id,
              mediaId: p.id === "seed-product-2" ? custom.id : old.id,
            },
          });
        }
        await db.product.update({
          where: { id: "seed-product-3" },
          data: {
            titleI18n: {
              fa: "عنوان مالک",
              tr: "Satıcı ürünü",
              en: "Merchant title",
            },
          },
        });
        await db.category.update({
          where: { id: "seed-category-women" },
          data: { mediaId: null },
        });
        await db.category.update({
          where: { id: "seed-category-men" },
          data: { mediaId: custom.id },
        });
        await db.homepage.update({
          where: { id: home.id },
          data: { blocks: legacyHomepageBlocks },
        });
        await upgradeDemoComposition(db);
        const links = async (id: string) =>
          (
            await db.productMedia.findMany({
              where: { productId: id },
              orderBy: { id: "asc" },
            })
          ).map((x) => x.mediaId);
        expect(await links("seed-product-1")).toEqual(["seed-fashion-v1-coat"]);
        expect(await links("seed-product-2")).toEqual([custom.id]);
        expect(await links("seed-product-3")).toEqual([old.id]);
        expect(
          (
            await db.category.findUniqueOrThrow({
              where: { id: "seed-category-women" },
            })
          ).mediaId,
        ).toBe("seed-fashion-v1-coat");
        expect(
          (
            await db.category.findUniqueOrThrow({
              where: { id: "seed-category-men" },
            })
          ).mediaId,
        ).toBe(custom.id);
        const upgraded = await db.homepage.findUniqueOrThrow({
          where: { id: home.id },
        });
        expect(upgraded.blocks).toEqual([
          {
            ...legacyHomepageBlocks[0],
            mediaId: "seed-fashion-v1-coat",
            ctaUrl: "/search",
            layout: "spatial",
          },
          ...legacyHomepageBlocks.slice(1),
        ]);
        await upgradeDemoComposition(db);
        expect(
          await db.homepage.findUnique({ where: { id: home.id } }),
        ).toEqual(upgraded);
        expect(await links("seed-product-1")).toEqual(["seed-fashion-v1-coat"]);
        const merchantBlocks = [
          {
            type: "RichText",
            text: {
              fa: "متن مالک",
              tr: "Satıcı metni",
              en: "Merchant content",
            },
          },
        ];
        await db.homepage.update({
          where: { id: home.id },
          data: { blocks: merchantBlocks },
        });
        await upgradeDemoComposition(db);
        expect(
          (await db.homepage.findUniqueOrThrow({ where: { id: home.id } }))
            .blocks,
        ).toEqual(merchantBlocks);
        expect(await db.media.findUnique({ where: { id: old.id } })).toEqual(
          old,
        );
      } finally {
        for (const p of products) {
          await db.productMedia.deleteMany({ where: { productId: p.id } });
          await db.productMedia.createMany({ data: p.media });
          await db.product.update({
            where: { id: p.id },
            data: {
              titleI18n: p.titleI18n as Prisma.InputJsonValue,
              updatedAt: p.updatedAt,
            },
          });
        }
        for (const c of categories)
          await db.category.update({
            where: { id: c.id },
            data: { mediaId: c.mediaId, updatedAt: c.updatedAt },
          });
        await db.homepage.update({
          where: { id: home.id },
          data: {
            blocks: home.blocks as Prisma.InputJsonValue,
            updatedAt: home.updatedAt,
          },
        });
        await db.media.delete({ where: { id: custom.id } });
      }
    });
  },
);
