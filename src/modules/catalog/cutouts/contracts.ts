import { z } from "zod";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const CUTOUT_SLOTS = [
  "TOP",
  "BOTTOM",
  "ONE_PIECE",
  "LAYER",
  "ACCESSORY",
  "SHOES",
] as const;
export const CUTOUT_ANCHORS = ["HAND", "NECK", "HEAD"] as const;
export const MODEL_KINDS = ["WOMAN", "MAN", "GIRL", "BOY"] as const;
export const placementSchema = z
  .object({
    modelId: id,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1.5),
    height: z.number().min(0.01).max(1.5),
    scale: z.number().min(0.2).max(3).default(1),
    rotation: z.number().min(-180).max(180).default(0),
    zIndex: z.number().int().min(-20).max(100).default(0),
  })
  .strict();
export const cutoutGeometrySchema = z
  .object({
    version: z.literal(1),
    models: z.array(placementSchema).min(1).max(40),
  })
  .strict()
  .refine(
    (v) => new Set(v.models.map((m) => m.modelId)).size === v.models.length,
    { message: "Duplicate model geometry" },
  );
export const cutoutInputSchema = z
  .object({
    productId: id,
    colorId: id,
    variantId: id.nullable(),
    mediaId: id,
    slot: z.enum(CUTOUT_SLOTS),
    anchor: z.enum(CUTOUT_ANCHORS).nullable(),
    geometry: cutoutGeometrySchema,
    expectedVersion: z.number().int().min(0).max(2147483646),
    confirm: z.literal(true),
    expectedImageFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    expectedModelFingerprints: z
      .array(
        z
          .object({
            modelId: id,
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict()
  .refine(
    (v) => (v.slot === "ACCESSORY" ? v.anchor !== null : v.anchor === null),
    { message: "Invalid slot anchor" },
  );
export const cutoutValidationSchema = z
  .object({
    version: z.literal(1),
    imageFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    confirmedAt: z.string().datetime(),
    models: z
      .array(
        z
          .object({
            modelId: id,
            mediaId: id,
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();
export type CutoutPlacement = z.infer<typeof placementSchema>;
export type CutoutGeometry = z.infer<typeof cutoutGeometrySchema>;

/** Slot exclusivity belongs to styling, not to the paid session/coin ledger. */
export function validCompositionSlots(
  items: {
    slot: (typeof CUTOUT_SLOTS)[number];
    anchor: (typeof CUTOUT_ANCHORS)[number] | null;
  }[],
) {
  if (items.length > 4 || !items.length) return false;
  const slots = new Set<string>();
  for (const item of items) {
    if (!(CUTOUT_SLOTS as readonly string[]).includes(item.slot)) return false;
    if (
      item.slot === "ACCESSORY" &&
      !(CUTOUT_ANCHORS as readonly string[]).includes(item.anchor ?? "")
    )
      return false;
    if (item.slot !== "ACCESSORY" && item.anchor !== null) return false;
    const key =
      item.slot === "ACCESSORY" ? `ACCESSORY:${item.anchor}` : item.slot;
    if (slots.has(key)) return false;
    slots.add(key);
  }
  return !(slots.has("ONE_PIECE") && (slots.has("TOP") || slots.has("BOTTOM")));
}
