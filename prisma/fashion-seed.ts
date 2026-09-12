import type { Prisma, PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import sharp from "sharp";
import { legacyHomepageBlocks } from "./demo-homepage";

export const fashionAssets = [
  {
    key: "coat",
    category: "women",
    title: { fa: "زنان", tr: "Kadın", en: "Women" },
    alt: {
      fa: "تصویر نمایشی هوش مصنوعی؛ بارانی شنی",
      tr: "Yapay zekâ örnek görseli; kum rengi trençkot",
      en: "AI demo image; sand trench coat",
    },
  },
  {
    key: "shirt",
    category: "men",
    title: { fa: "مردان", tr: "Erkek", en: "Men" },
    alt: {
      fa: "تصویر نمایشی هوش مصنوعی؛ پیراهن سرمه‌ای",
      tr: "Yapay zekâ örnek görseli; lacivert gömlek",
      en: "AI demo image; navy overshirt",
    },
  },
  {
    key: "kids",
    category: "kids",
    title: { fa: "کودکان", tr: "Çocuk", en: "Kids" },
    alt: {
      fa: "تصویر نمایشی هوش مصنوعی؛ ست بافت کودک",
      tr: "Yapay zekâ örnek görseli; çocuk triko takımı",
      en: "AI demo image; children's knit outfit",
    },
  },
  {
    key: "bag",
    category: "accessories",
    title: { fa: "اکسسوری", tr: "Aksesuar", en: "Accessories" },
    alt: {
      fa: "تصویر نمایشی هوش مصنوعی؛ کیف قهوه‌ای",
      tr: "Yapay zekâ örnek görseli; taba çanta",
      en: "AI demo image; tan tote bag",
    },
  },
] as const;

/** Add new, immutable demo files through the configured provider. The old
 * originals stay in storage; nothing referenced by historical data is replaced. */
export async function seedFashionStorefront(
  db: PrismaClient,
  put: (key: string, bytes: Buffer) => Promise<string>,
) {
  for (const asset of fashionAssets) {
    const id = `seed-fashion-v1-${asset.key}`;
    if (await db.media.findUnique({ where: { id } })) continue;
    const bytes = await readFile(
      path.join(process.cwd(), "prisma/demo-assets", `${asset.key}.webp`),
    );
    const metadata = await sharp(bytes).metadata();
    const prefix = `media/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${randomUUID()}`;
    const variants: Record<
      string,
      { url: string; key: string; bytes: number }
    > = {};
    for (const width of [320, 640, 960]) {
      const data = await sharp(bytes)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const storageKey = `media/variants/${id}/${width}.webp`;
      variants[String(width)] = {
        url: await put(storageKey, data),
        key: storageKey,
        bytes: data.length,
      };
    }
    const storageKey = `${prefix}.webp`;
    const url = await put(storageKey, bytes);
    const blur = await sharp(bytes).resize(16).webp({ quality: 40 }).toBuffer();
    await db.media.create({
      data: {
        id,
        kind: "image",
        storageKey,
        url,
        originalName: `demo-fashion-v1-${asset.key}.webp`,
        width: metadata.width,
        height: metadata.height,
        bytes: bytes.length,
        mime: "image/webp",
        status: "READY",
        variants: { webp: variants },
        blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
        altI18n: asset.alt,
        tags: ["demo", "ai-generated"],
      },
    });
  }
  await upgradeDemoComposition(db);
}

/** Only untouched, known seed records qualify. Merchant images, edited text,
 * soft deletions, market homepages and all commercial records remain intact. */
export async function upgradeDemoComposition(db: PrismaClient) {
  await db.$transaction(
    async (tx) => {
      for (const asset of fashionAssets) {
        const id = `seed-fashion-v1-${asset.key}`;
        const media = await tx.media.findFirst({
          where: { id, deletedAt: null, status: "READY" },
        });
        if (!media) continue;
        const category = await tx.category.findUnique({
          where: { id: `seed-category-${asset.category}` },
        });
        if (
          category &&
          !category.deletedAt &&
          !category.mediaId &&
          isDeepStrictEqual(category.titleI18n, asset.title)
        )
          await tx.category.updateMany({
            where: {
              id: category.id,
              updatedAt: category.updatedAt,
              mediaId: null,
            },
            data: { mediaId: id },
          });
        const products = await tx.product.findMany({
          where: {
            categoryId: `seed-category-${asset.category}`,
            deletedAt: null,
            tags: { has: "seed" },
          },
          include: { media: { include: { media: true } } },
        });
        for (const product of products) {
          const match = /^seed-product-([1-9]|[12][0-9]|30)$/.exec(product.id);
          if (
            !match ||
            !isDeepStrictEqual(product.titleI18n, {
              fa: `محصول نمونه ${match[1]}`,
              tr: `Örnek ürün ${match[1]}`,
              en: `Sample product ${match[1]}`,
            })
          )
            continue;
          if (
            !product.media.length ||
            !product.media.every(
              (link) =>
                link.media.folderId === "seed-folder-محصولات" &&
                !link.media.deletedAt &&
                !link.media.uploadedBy &&
                link.media.width === 800 &&
                link.media.height === 600 &&
                link.media.mime === "image/jpeg" &&
                /^seed-محصولات-[1-4]\.jpg$/.test(link.media.originalName),
            )
          )
            continue;
          await tx.productMedia.deleteMany({
            where: { id: { in: product.media.map((link) => link.id) } },
          });
          await tx.productMedia.create({
            data: { productId: product.id, mediaId: id, sortOrder: 0 },
          });
        }
      }
      const home = await tx.homepage.findUnique({
        where: { id: "seed-homepage-global" },
      });
      const hero = await tx.media.findFirst({
        where: { id: "seed-fashion-v1-coat", deletedAt: null, status: "READY" },
      });
      if (
        home &&
        !home.deletedAt &&
        home.marketId === null &&
        hero &&
        isDeepStrictEqual(home.blocks, legacyHomepageBlocks)
      ) {
        const blocks = structuredClone(
          legacyHomepageBlocks,
        ) as Prisma.InputJsonObject[];
        blocks[0] = { ...blocks[0], mediaId: hero.id, ctaUrl: "/search" };
        await tx.homepage.updateMany({
          where: { id: home.id, updatedAt: home.updatedAt },
          data: { blocks },
        });
      }
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}
