import { z } from "zod";
import { SCENE_ASPECTS } from "./geometry";
import { localizedTextSchema } from "../validation";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const SCENE_PIECE_LIMIT = 12;
export const pointSchema = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .strict();
export const sceneImageSchema = z
  .object({
    mediaId: id,
    aspect: z.enum(SCENE_ASPECTS).default("4:5"),
    fit: z.enum(["cover", "contain"]).default("contain"),
    focal: pointSchema.default({ x: 0.5, y: 0.5 }),
  })
  .strict();
export const scenePieceSchema = z
  .object({
    id,
    productId: id,
    colorId: id,
    referenceMediaId: id,
    preferredVariantId: id.optional(),
    label: localizedTextSchema.optional(),
    desktop: pointSchema,
    mobile: pointSchema,
    side: z.enum(["start", "end"]).default("end"),
  })
  .strict();
export const shoppableSceneSchema = z
  .object({
    version: z.literal(1),
    id,
    mode: z.enum(["PHOTO", "COMPOSITE"]),
    modelId: id.optional(),
    relatedVideoMediaId: id.optional(),
    title: localizedTextSchema,
    alt: localizedTextSchema,
    desktop: sceneImageSchema,
    mobile: sceneImageSchema,
    pieces: z.array(scenePieceSchema).min(1).max(SCENE_PIECE_LIMIT),
    // Server-generated; submitted stamps are retained only when they match the
    // previously persisted draft. A checkbox cannot mint a client-side approval.
    match: z
      .object({
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        confirmedAt: z.string().datetime(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((scene, ctx) => {
    if (scene.relatedVideoMediaId && scene.mode !== "PHOTO")
      ctx.addIssue({
        code: "custom",
        message: "Filmed garments require PHOTO confirmation",
      });
    if (
      scene.mode === "COMPOSITE" &&
      (!scene.modelId || scene.pieces.length > 4)
    )
      ctx.addIssue({
        code: "custom",
        message: "Composite requires a store model and at most four pieces",
      });
    if (scene.mode === "PHOTO" && scene.modelId)
      ctx.addIssue({
        code: "custom",
        message: "Photo cannot claim a composite model",
      });
    if (new Set(scene.pieces.map((p) => p.id)).size !== scene.pieces.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate scene piece identity",
      });
    if (
      new Set(scene.pieces.map((p) => p.productId)).size !== scene.pieces.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate scene product" });
  });
export type ShoppableScene = z.infer<typeof shoppableSceneSchema>;
export function sceneMediaIds(scene: ShoppableScene) {
  return [
    ...new Set([
      scene.desktop.mediaId,
      scene.mobile.mediaId,
      ...scene.pieces.map((p) => p.referenceMediaId),
    ]),
  ].sort();
}

/** Identity of the pixels/catalog relation the operator actually previewed. */
export function sceneConfirmationKey(scene: ShoppableScene) {
  return JSON.stringify({
    mode: scene.mode,
    modelId: scene.modelId,
    relatedVideoMediaId: scene.relatedVideoMediaId,
    desktop: scene.desktop.mediaId,
    mobile: scene.mobile.mediaId,
    pieces: scene.pieces.map((piece) => [
      piece.productId,
      piece.colorId,
      piece.referenceMediaId,
      piece.preferredVariantId,
    ]),
  });
}
