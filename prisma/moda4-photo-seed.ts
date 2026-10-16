import type { PrismaClient } from "@prisma/client";
import type { ShoppableScene } from "../src/modules/content/scenes/contracts";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

// Only called inside the proven-empty MODA4 demo bootstrap. These are the
// supplied, approved synthetic reference photos and their curated catalog pieces;
// this is never an automatic confirmation of merchant content or changed pixels.
const looks = [
  {
    photo: "look-women-coat",
    title: "City Layers",
    pieces: ["women-coat", "accessories-bag"],
  },
  { photo: "look-men", title: "Easy Days", pieces: ["men-shirt", "men-chino"] },
  {
    photo: "look-kids",
    title: "Play Date",
    pieces: ["kids-knit", "kids-trousers"],
  },
  {
    photo: "look-women-knit",
    title: "Soft Forms",
    pieces: ["women-knit", "women-trousers", "accessories-bag"],
  },
  { photo: "look-girl", title: "Little Worlds", pieces: ["kids-dress"] },
] as const;
export async function seedModa4PhotoScene(
  db: PrismaClient,
  put: (key: string, bytes: Buffer) => Promise<string>,
  id: string,
  n: number,
): Promise<ShoppableScene> {
  const look = looks[n % looks.length];
  const wideId = `seed-moda4-wide-${look.photo}`;
  let wide = await db.media.findUnique({ where: { id: wideId } });
  if (!wide) {
    const bytes = await readFile(
      path.join(
        process.cwd(),
        "prisma/demo-assets/moda4/banners",
        `${look.photo}-wide.webp`,
      ),
    );
    const metadata = await sharp(bytes).metadata();
    const storageKey = `media/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${randomUUID()}.webp`;
    const variants: Record<
      string,
      { url: string; key: string; bytes: number }
    > = {};
    for (const width of [640, 960, 1440]) {
      const rendered = await sharp(bytes)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer();
      const key = `media/variants/${wideId}/${width}.webp`;
      variants[String(width)] = {
        url: await put(key, rendered),
        key,
        bytes: rendered.length,
      };
    }
    wide = await db.media.create({
      data: {
        id: wideId,
        kind: "image",
        status: "READY",
        mime: "image/webp",
        storageKey,
        url: await put(storageKey, bytes),
        originalName: `demo-fashion-v2-${look.photo}-wide.webp`,
        width: metadata.width,
        height: metadata.height,
        bytes: bytes.length,
        variants: { webp: variants },
        tags: ["demo", "approved-prototype", "ai-generated"],
        altI18n: { fa: look.title, tr: look.title, en: look.title },
      },
    });
  }
  const products = await db.product.findMany({
    where: { id: { in: look.pieces.map((key) => `seed-moda4-style-${key}`) } },
    include: { media: true, variants: { include: { color: true } } },
  });
  const scene: ShoppableScene = {
    version: 1,
    id,
    mode: "PHOTO",
    title: { fa: look.title, tr: look.title, en: look.title },
    alt: { fa: look.title, tr: look.title, en: look.title },
    desktop: {
      mediaId: wideId,
      aspect: "16:9",
      fit: "cover",
      focal: { x: 0.5, y: 0 },
    },
    mobile: {
      mediaId: `seed-fashion-v2-${look.photo}`,
      aspect: "3:4",
      fit: "cover",
      focal: { x: 0.5, y: 0 },
    },
    pieces: look.pieces.map((key, index) => {
      const p = products.find((p) => p.id === `seed-moda4-style-${key}`)!;
      const v = p.variants[0];
      return {
        id: `${id}-piece-${index}`,
        productId: p.id,
        colorId: v.colorId,
        referenceMediaId: p.media[0].mediaId,
        desktop: { x: 0.25 + index * 0.2, y: 0.46 },
        mobile: { x: 0.3 + index * 0.22, y: 0.4 + index * 0.1 },
        side: "end",
      };
    }),
  };
  const mediaIds = [
    ...new Set([
      scene.desktop.mediaId,
      scene.mobile.mediaId,
      ...scene.pieces.map((p) => p.referenceMediaId),
    ]),
  ].sort();
  const images = await db.media.findMany({ where: { id: { in: mediaIds } } });
  // Same byte identity as sceneReferenceSnapshot(PHOTO). Integration acceptance
  // resolves these scenes through that production guard; no runtime bypass.
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        mode: scene.mode,
        desktop: scene.desktop.mediaId,
        mobile: scene.mobile.mediaId,
        pieces: scene.pieces.map((p) => ({
          productId: p.productId,
          colorId: p.colorId,
          referenceMediaId: p.referenceMediaId,
          color: products
            .find((v) => v.id === p.productId)
            ?.variants.find((v) => v.colorId === p.colorId)?.color.hex,
        })),
        images: images
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((image) => ({
            id: image.id,
            storageKey: image.storageKey,
            width: image.width,
            height: image.height,
            variants: image.variants,
          })),
      }),
    )
    .digest("hex");
  return {
    ...scene,
    match: { fingerprint, confirmedAt: new Date().toISOString() },
  };
}
