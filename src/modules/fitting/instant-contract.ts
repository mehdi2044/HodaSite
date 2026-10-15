import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const instantSelectionSchema = z
  .object({
    modelId: id,
    variantIds: z
      .array(id)
      .min(1)
      .max(4)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export const instantSaveSchema = instantSelectionSchema
  .extend({
    requestKey: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    id: id.optional(),
    expectedVersion: z.number().int().min(1).max(2147483646).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.id) === (v.expectedVersion !== undefined));
export const instantRowSchema = z
  .object({
    id,
    expectedVersion: z.number().int().min(1).max(2147483646),
    operation: z.enum(["archive", "restore", "delete"]),
    confirm: z.literal(true),
  })
  .strict();
export const instantSnapshotSchema = instantSelectionSchema
  .extend({
    version: z.literal(1),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    revisions: z
      .array(
        z
          .object({
            variantId: id,
            profileId: id,
            profileVersion: z.number().int().positive(),
            mediaId: id,
            modelFingerprint: z.string(),
            imageFingerprint: z.string(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    modelMediaId: id,
  })
  .strict();
export type InstantSelection = z.infer<typeof instantSelectionSchema>;
