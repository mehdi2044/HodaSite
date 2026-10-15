import { z } from "zod";
import { localizedTextSchema } from "./validation";
import { shoppableSceneSchema, sceneImageSchema } from "./scenes/contracts";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const contentTargetSchema = z
  .object({
    kind: z.enum([
      "category",
      "collection",
      "product",
      "page",
      "catalog",
      "search",
      "fitting",
    ]),
    id: id.optional(),
  })
  .strict()
  .refine(
    (v) => ["catalog", "search", "fitting"].includes(v.kind) || Boolean(v.id),
    { message: "Target identity required" },
  );
const base = { id, version: z.literal(1), enabled: z.boolean().default(true) };
export const modaSourceSchema = z
  .object({
    mode: z.enum(["latest", "bestseller", "category", "collection", "manual"]),
    referenceId: id.optional(),
    productIds: z.array(id).max(24).default([]),
    limit: z.number().int().min(1).max(24).default(6),
  })
  .strict()
  .refine((v) => new Set(v.productIds).size === v.productIds.length)
  .refine((v) => v.mode !== "manual" || v.productIds.length > 0)
  .refine(
    (v) =>
      !["category", "collection"].includes(v.mode) || Boolean(v.referenceId),
  );
export const modaHeroSlideSchema = z
  .object({
    id,
    eyebrow: localizedTextSchema,
    scene: shoppableSceneSchema,
    body: localizedTextSchema,
    textSide: z.enum(["start", "end"]).default("start"),
    ctaLabel: localizedTextSchema,
    target: contentTargetSchema,
    secondaryLabel: localizedTextSchema.optional(),
    secondaryTarget: contentTargetSchema.optional(),
  })
  .strict();
export const modaWorldFaceSchema = z
  .object({
    id,
    categoryId: id,
    title: localizedTextSchema,
    subtitle: localizedTextSchema,
    desktop: sceneImageSchema,
    mobile: sceneImageSchema,
    scene: shoppableSceneSchema.optional(),
  })
  .strict();
export const moda4BlockSchemas = [
  z
    .object({
      ...base,
      type: z.literal("HeroSlider"),
      slides: z.array(modaHeroSlideSchema).min(1).max(8),
      autoplaySeconds: z.number().min(5).max(30).default(7),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("Bands"),
      first: z.array(localizedTextSchema).min(1).max(12),
      second: z.array(localizedTextSchema).min(1).max(12),
      durationSeconds: z.number().min(10).max(120).default(30),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("WorldsPrism"),
      title: localizedTextSchema,
      faces: z.array(modaWorldFaceSchema).length(4),
      autoplaySeconds: z.number().min(3).max(20).default(3.8),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("NewIn"),
      title: localizedTextSchema,
      source: modaSourceSchema,
      ctaLabel: localizedTextSchema,
      target: contentTargetSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("FittingAd"),
      title: localizedTextSchema,
      body: localizedTextSchema,
      looks: z
        .array(
          z
            .object({
              id,
              label: localizedTextSchema,
              scene: shoppableSceneSchema,
              finalPhoto: shoppableSceneSchema.optional(),
            })
            .strict(),
        )
        .min(1)
        .max(4),
      ctaLabel: localizedTextSchema,
      target: contentTargetSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("Lookbook"),
      title: localizedTextSchema,
      scenes: z.array(shoppableSceneSchema).min(1).max(12),
      autoplaySeconds: z.number().min(3).max(30).default(4.8),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("KidsWorld"),
      title: localizedTextSchema,
      body: localizedTextSchema,
      source: modaSourceSchema,
      tone: z
        .enum([
          "kidsPink",
          "kidsMint",
          "kidsSky",
          "kidsButter",
          "kidsLilac",
          "kidsPeach",
        ])
        .default("kidsMint"),
      ctaLabel: localizedTextSchema,
      target: contentTargetSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("Services"),
      title: localizedTextSchema,
      keys: z
        .array(z.enum(["shipping", "returns", "prices", "support"]))
        .min(1)
        .max(4),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("Campaign"),
      title: localizedTextSchema,
      body: localizedTextSchema,
      programId: id,
      scene: shoppableSceneSchema.optional(),
      desktop: sceneImageSchema,
      mobile: sceneImageSchema,
      ctaLabel: localizedTextSchema,
      target: contentTargetSchema,
      countdown: z.boolean().default(false),
      popup: z
        .object({
          enabled: z.boolean(),
          delaySeconds: z.number().int().min(0).max(120),
          frequencyHours: z.number().int().min(1).max(720),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("VideoBanner"),
      title: localizedTextSchema,
      body: localizedTextSchema,
      videoMediaId: id,
      desktop: sceneImageSchema,
      mobile: sceneImageSchema,
      scene: shoppableSceneSchema.optional(),
      ctaLabel: localizedTextSchema,
      target: contentTargetSchema,
      mutedAutoplay: z.boolean().default(false),
    })
    .strict(),
] as const;
export type Moda4Block = z.infer<(typeof moda4BlockSchemas)[number]>;
export const MODA4_TYPES = [
  "HeroSlider",
  "Bands",
  "WorldsPrism",
  "NewIn",
  "FittingAd",
  "Lookbook",
  "KidsWorld",
  "Services",
  "Campaign",
  "VideoBanner",
] as const;
export function isModa4Block(block: { type: string }): block is Moda4Block {
  return (MODA4_TYPES as readonly string[]).includes(block.type);
}
