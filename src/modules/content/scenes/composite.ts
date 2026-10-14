import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { validCompositionSlots } from "@/modules/catalog/cutouts/contracts";
import { resolveCutoutPlacement } from "@/modules/catalog/cutouts/resolve";
import { storeCutoutModels } from "@/modules/catalog/cutouts/models";
import type { ShoppableScene } from "./contracts";
import { sceneMediaIds } from "./contracts";

type Tx = Prisma.TransactionClient;
export type ScenePlacement = NonNullable<
  Awaited<ReturnType<typeof resolveCutoutPlacement>>
>;
/** Called after the sorted Product/Variant locks, before any scene Media locks. */
async function lockCompositeReferences(scenes: ShoppableScene[], tx: Tx) {
  const composites = scenes.filter((scene) => scene.mode === "COMPOSITE");
  if (!composites.length) return [] as string[];
  const products = [
    ...new Set(
      composites.flatMap((scene) =>
        scene.pieces.map((piece) => piece.productId),
      ),
    ),
  ].sort();
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "CatalogCutout" WHERE "productId" IN (${Prisma.join(products)}) ORDER BY id FOR SHARE`,
  );
  await tx.$queryRaw`SELECT id FROM "Integration" WHERE key='fitting-room' FOR SHARE`;
  const models = await storeCutoutModels(tx);
  const profiles = await tx.catalogCutout.findMany({
    where: { productId: { in: products }, deletedAt: null },
    select: { mediaId: true },
  });
  // Invalid unused overrides/archived sources must not block unrelated valid imagery.
  // The caller freezes this complete set together with all scene images;
  // actual references are checked again after that wait.
  const ids = [
    ...new Set([
      ...profiles.map((row) => row.mediaId),
      ...models
        .filter((model) =>
          composites.some((scene) => scene.modelId === model.id),
        )
        .map((model) => model.mediaId),
    ]),
  ].sort();
  return ids;
}
/** One sorted Media set prevents cross-scene or cutout/model lock inversion. */
export async function lockSceneMediaReferences(
  scenes: ShoppableScene[],
  tx: Tx,
  additionalIds: string[] = [],
  additionalVideos: string[] = [],
  retainedIds: string[] = [],
) {
  const videos = [
    ...new Set([
      ...additionalVideos,
      ...scenes.flatMap((scene) =>
        scene.relatedVideoMediaId ? [scene.relatedVideoMediaId] : [],
      ),
    ]),
  ];
  const explicit = [
    ...new Set([
      ...additionalIds.filter((id) => !videos.includes(id)),
      ...scenes.flatMap(sceneMediaIds),
    ]),
  ];
  const required = [
    ...new Set([
      ...explicit,
      ...videos,
      ...(await lockCompositeReferences(scenes, tx)),
    ]),
  ];
  const ids = [...new Set([...required, ...retainedIds])].sort();
  if (!ids.length) return;
  const rows = await tx.$queryRaw<
    {
      id: string;
      kind: string;
      mime: string;
      status: string;
      deletedAt: Date | null;
    }[]
  >(
    Prisma.sql`SELECT id,kind,mime,status,"deletedAt" FROM "Media" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`,
  );
  if (
    required.some((id) => !rows.some((row) => row.id === id)) ||
    videos.some(
      (id) =>
        !rows.some(
          (row) =>
            row.id === id &&
            row.kind === "video" &&
            row.status === "READY" &&
            row.deletedAt === null &&
            ["video/mp4", "video/webm"].includes(row.mime),
        ),
    ) ||
    explicit.some(
      (id) =>
        !rows.some(
          (row) =>
            row.id === id &&
            row.kind === "image" &&
            row.status === "READY" &&
            row.deletedAt === null,
        ),
    )
  )
    throw new z.ZodError([]);
}
/** A reference swaps the actual validated pixels and geometry as one unit. */
export async function compositeSceneReferences(
  scene: ShoppableScene,
  marketId: string,
  tx: Tx = db,
) {
  if (scene.mode !== "COMPOSITE" || !scene.modelId) throw new z.ZodError([]);
  const model = (await storeCutoutModels(tx)).find(
    (choice) => choice.id === scene.modelId,
  );
  if (
    !model ||
    scene.desktop.mediaId !== model.mediaId ||
    scene.mobile.mediaId !== model.mediaId
  )
    throw new z.ZodError([]);
  const variants = await tx.variant.findMany({
    where: {
      isActive: true,
      color: { deletedAt: null },
      size: { deletedAt: null },
      product: {
        status: "ACTIVE",
        deletedAt: null,
        coinPackCoins: null,
        marketIds: { has: marketId },
        category: { deletedAt: null },
      },
      OR: scene.pieces.map((piece) => ({
        productId: piece.productId,
        colorId: piece.colorId,
      })),
    },
    orderBy: { id: "asc" },
    select: { id: true, productId: true, colorId: true },
  });
  const pieces = await Promise.all(
    scene.pieces.map(async (piece) => {
      const choices = variants.filter(
        (variant) =>
          variant.productId === piece.productId &&
          variant.colorId === piece.colorId,
      );
      const placements = await Promise.all(
        choices.map(async (variant) => ({
          variantId: variant.id,
          placement: await resolveCutoutPlacement(
            variant.id,
            marketId,
            scene.modelId!,
            tx,
          ),
        })),
      );
      const valid = placements.filter(
        (item): item is { variantId: string; placement: ScenePlacement } =>
          item.placement !== null,
      );
      const display = (
        piece.preferredVariantId
          ? valid.find((item) => item.variantId === piece.preferredVariantId)
          : valid[0]
      )?.placement;
      if (!display) throw new z.ZodError([]);
      if (display.mediaId !== piece.referenceMediaId) throw new z.ZodError([]);
      // A size override may change pixels/geometry, but must preserve the configured slot/anchor.
      if (
        valid.some(
          (item) =>
            item.placement.slot !== display.slot ||
            item.placement.anchor !== display.anchor,
        )
      )
        throw new z.ZodError([]);
      return { id: piece.id, display, variants: valid };
    }),
  );
  if (!validCompositionSlots(pieces.map((piece) => piece.display)))
    throw new z.ZodError([]);
  return { model, pieces };
}
export async function compositeSceneFingerprint(
  scene: ShoppableScene,
  marketIds: string[],
  tx: Tx = db,
) {
  // An unserved global draft still has to bind live public imagery in a market.
  const markets = marketIds.length
    ? marketIds
    : (
        await tx.market.findMany({
          where: { isActive: true },
          orderBy: { id: "asc" },
          take: 1,
          select: { id: true },
        })
      ).map((market) => market.id);
  if (!markets.length) throw new z.ZodError([]);
  const snapshots = await Promise.all(
    markets.map((marketId) => compositeSceneReferences(scene, marketId, tx)),
  );
  const snapshot = snapshots[0];
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: snapshot.model.fingerprint,
        pieces: snapshot.pieces.map((piece) => ({
          id: piece.id,
          variants: piece.variants.map(({ variantId, placement }) => ({
            variantId,
            profileId: placement.profileId,
            version: placement.profileVersion,
            media: {
              mediaId: placement.mediaId,
              url: placement.media.url,
              width: placement.media.width,
              height: placement.media.height,
              variants: placement.media.variants,
            },
            geometry: placement.geometry,
            slot: placement.slot,
            anchor: placement.anchor,
          })),
        })),
      }),
    )
    .digest("hex");
}
