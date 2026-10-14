import { z } from "zod";
import { addSceneCartItems } from "@/modules/cart";
import { CommerceError } from "@/modules/orders";
import { blockScenes, bindBlockVideoScenes } from "../block-scenes";
import { homepageBlocksSchema } from "../homepage";
import {
  lockSceneCatalog,
  sceneReferenceFingerprint,
  assertPhotoMatch,
} from "./references";
import {
  lockSceneMediaReferences,
  compositeSceneReferences,
} from "./composite";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export async function addShoppableScene(
  locale: "fa" | "tr" | "en",
  raw: unknown,
) {
  const input = z
    .object({ sceneId: id, variantIds: z.array(id).min(1).max(12) })
    .strict()
    .parse(raw);
  await addSceneCartItems(locale, input.variantIds, async (tx, marketId) => {
    // Freeze both fallback scopes before selecting a published composition.
    for (const key of ["homepage:global", `homepage:market:${marketId}`].sort())
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
    const rows = await tx.homepage.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
        OR: [{ marketId }, { marketId: null }],
      },
    });
    const row =
      rows.find((r) => r.marketId === marketId) ??
      rows.find((r) => r.marketId === null);
    if (!row) throw new CommerceError("VALIDATION");
    await tx.$queryRaw`SELECT id FROM "Homepage" WHERE id=${row.id} FOR SHARE`;
    const current = await tx.homepage.findUniqueOrThrow({
      where: { id: row.id },
    });
    const blocks = bindBlockVideoScenes(
      homepageBlocksSchema.parse(current.blocks),
    );
    const scene = blockScenes(
      blocks.filter((block) => block.enabled !== false),
    ).find((s) => s.id === input.sceneId);
    if (!scene) throw new CommerceError("VALIDATION");
    await lockSceneCatalog([scene], tx);
    await lockSceneMediaReferences([scene], tx);
    assertPhotoMatch(
      scene,
      await sceneReferenceFingerprint(scene, [marketId], tx),
    );
    const variants = await tx.variant.findMany({
      where: {
        id: { in: input.variantIds },
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
      },
      select: { id: true, productId: true, colorId: true },
    });
    if (
      variants.length !== input.variantIds.length ||
      variants.length !== scene.pieces.length ||
      new Set(variants.map((v) => v.productId)).size !== variants.length ||
      !scene.pieces.every((piece) =>
        variants.some(
          (v) => v.productId === piece.productId && v.colorId === piece.colorId,
        ),
      )
    )
      throw new CommerceError("VALIDATION");
    if (scene.mode === "COMPOSITE") {
      const live = await compositeSceneReferences(scene, marketId, tx);
      if (
        !live.pieces.every((piece) =>
          piece.variants.some((variant) =>
            input.variantIds.includes(variant.variantId),
          ),
        )
      )
        throw new CommerceError("VALIDATION");
    }
  });
}
