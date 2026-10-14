import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { ShoppableScene } from "./contracts";
import { sceneMediaIds } from "./contracts";
import {
  compositeSceneFingerprint,
  lockSceneMediaReferences,
} from "./composite";

type Client = Prisma.TransactionClient;
/** Price, name and stock edits deliberately do not change photographed pixels. */
export async function sceneReferenceSnapshot(
  scene: ShoppableScene,
  marketIds: string[],
  tx: Client = db,
  lock = false,
) {
  const productIds = [...new Set(scene.pieces.map((p) => p.productId))].sort();
  if (scene.mode === "COMPOSITE") {
    if (lock) {
      await lockSceneCatalog([scene], tx);
      await lockSceneMediaReferences([scene], tx);
    }
    return {
      fingerprint: await compositeSceneFingerprint(scene, marketIds, tx),
      images: [] as Awaited<ReturnType<typeof tx.media.findMany>>,
      video: null as Awaited<ReturnType<typeof tx.media.findFirst>>,
    };
  }
  if (lock) {
    await lockSceneCatalog([scene], tx);
    await lockSceneMediaReferences([scene], tx);
  }
  const [products, images, video] = await Promise.all([
    tx.product.findMany({
      where: {
        id: { in: productIds },
        status: "ACTIVE",
        deletedAt: null,
        coinPackCoins: null,
        marketIds: { hasEvery: marketIds },
        category: { deletedAt: null },
      },
      include: {
        media: true,
        variants: {
          where: {
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
          include: { media: true, color: true },
        },
      },
    }),
    tx.media.findMany({
      where: {
        id: { in: sceneMediaIds(scene) },
        kind: "image",
        status: "READY",
        deletedAt: null,
      },
    }),
    scene.relatedVideoMediaId
      ? tx.media.findFirst({
          where: {
            id: scene.relatedVideoMediaId,
            kind: "video",
            mime: { in: ["video/mp4", "video/webm"] },
            status: "READY",
            deletedAt: null,
          },
        })
      : null,
  ]);
  if (scene.relatedVideoMediaId && !video) throw new z.ZodError([]);
  if (images.length !== sceneMediaIds(scene).length) throw new z.ZodError([]);
  for (const piece of scene.pieces) {
    const product = products.find((p) => p.id === piece.productId);
    const variants =
      product?.variants.filter((v) => v.colorId === piece.colorId) ?? [];
    if (
      !variants.length ||
      (piece.preferredVariantId &&
        !variants.some((v) => v.id === piece.preferredVariantId)) ||
      !(
        variants.some((v) =>
          v.media.some((link) => link.mediaId === piece.referenceMediaId),
        ) ||
        (product &&
          new Set(product.variants.map((v) => v.colorId)).size === 1 &&
          product.media.some((link) => link.mediaId === piece.referenceMediaId))
      )
    )
      throw new z.ZodError([]);
  }
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
            .find((product) => product.id === p.productId)
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
        ...(video
          ? {
              relatedVideo: {
                id: video.id,
                storageKey: video.storageKey,
                url: video.url,
                mime: video.mime,
                bytes: video.bytes,
                width: video.width,
                height: video.height,
              },
            }
          : {}),
      }),
    )
    .digest("hex");
  return { fingerprint, images, video };
}
export async function sceneReferenceFingerprint(
  scene: ShoppableScene,
  marketIds: string[],
  tx: Client = db,
  lock = false,
) {
  return (await sceneReferenceSnapshot(scene, marketIds, tx, lock)).fingerprint;
}
export function assertPhotoMatch(scene: ShoppableScene, fingerprint: string) {
  // PHOTO is explicitly confirmed; COMPOSITE is server-bound to the actual
  // R4 cutout/model/geometry snapshot when the draft is saved.
  if (scene.match?.fingerprint !== fingerprint) throw new z.ZodError([]);
}

export async function lockSceneCatalog(
  allScenes: ShoppableScene[],
  tx: Client,
) {
  const productIds = [
    ...new Set(
      allScenes.flatMap((scene) => scene.pieces.map((p) => p.productId)),
    ),
  ].sort();
  if (!productIds.length) return;

  // Product UPDATE locks prevent new variant/reference FK inserts while we
  // validate the color's actual reference-image relation.
  const lockedProducts = await tx.$queryRaw<{ categoryId: string }[]>(
    Prisma.sql`SELECT id, "categoryId" FROM "Product" WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`,
  );
  const categoryIds = [
    ...new Set(lockedProducts.map((p) => p.categoryId)),
  ].sort();
  if (categoryIds.length)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Category" WHERE id IN (${Prisma.join(categoryIds)}) ORDER BY id FOR SHARE`,
    );
  const variants = await tx.variant.findMany({
    where: { productId: { in: productIds } },
    select: { id: true, colorId: true, sizeId: true },
  });
  for (const [table, ids] of [
    ["Variant", variants.map((v) => v.id)],
    [
      "Color",
      [
        ...allScenes.flatMap((scene) => scene.pieces).map((p) => p.colorId),
        ...variants.map((v) => v.colorId),
      ],
    ],
    ["Size", variants.map((v) => v.sizeId)],
  ] as const) {
    const unique = [...new Set(ids)].sort();
    if (unique.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM ${Prisma.raw('"' + table + '"')} WHERE id IN (${Prisma.join(unique)}) ORDER BY id ${table === "Variant" ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`}`,
      );
  }
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "ProductMedia" WHERE "productId" IN (${Prisma.join(productIds)}) ORDER BY id FOR SHARE`,
  );
  const variantIds = variants.map((v) => v.id).sort();
  if (variantIds.length)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "VariantMedia" WHERE "variantId" IN (${Prisma.join(variantIds)}) ORDER BY id FOR SHARE`,
    );
}
