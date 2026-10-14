import { unstable_cache } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { moda4BlockSchemas } from "./moda4-contracts";
import { shoppableSceneSchema } from "./scenes/contracts";
import { localizedTextSchema, safeLinkSchema } from "./validation";

const optionalMetadata = {
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .optional(),
  version: z.literal(1).optional(),
  enabled: z.boolean().optional(),
};
const mediaId = z.string().trim().min(1).max(100);
export const preparedLookSchema = z
  .object({
    id: mediaId,
    label: localizedTextSchema,
    categoryId: mediaId,
    mediaId,
    items: z
      .array(z.object({ productId: mediaId, colorId: mediaId }))
      .min(2)
      .max(4),
  })
  .superRefine((look, ctx) => {
    if (
      new Set(look.items.map((item) => item.productId)).size !==
      look.items.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate outfit product" });
  });
const sourceSchema = z.object({
  mode: z.enum(["latest", "bestseller", "category", "collection"]),
  referenceId: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(12).default(4),
});

const legacyBlockSchemas = [
  z
    .object({
      ...optionalMetadata,
      type: z.literal("ShopLook"),
      scene: shoppableSceneSchema.optional(),
      title: localizedTextSchema,
      body: localizedTextSchema,
      looks: z.array(preparedLookSchema).max(8),
    })
    .refine((block) => Boolean(block.scene) || block.looks.length > 0, {
      message: "ShopLook requires a shared scene or retained prepared looks",
    }),
  z.object({
    ...optionalMetadata,
    type: z.literal("Hero"),
    scene: shoppableSceneSchema.optional(),
    layout: z.enum(["editorial", "spatial"]).optional(),
    mediaId: mediaId.optional(),
    title: localizedTextSchema,
    body: localizedTextSchema,
    ctaLabel: localizedTextSchema,
    ctaUrl: safeLinkSchema.optional(),
  }),
  z.object({
    ...optionalMetadata,
    type: z.literal("CategoryCards"),
    title: localizedTextSchema,
    source: sourceSchema,
  }),
  z.object({
    ...optionalMetadata,
    type: z.literal("ProductStrip"),
    title: localizedTextSchema,
    source: sourceSchema,
  }),
  z.object({
    ...optionalMetadata,
    type: z.literal("Banner"),
    scene: shoppableSceneSchema.optional(),
    mediaId: mediaId.optional(),
    title: localizedTextSchema,
    body: localizedTextSchema,
    ctaLabel: localizedTextSchema,
    ctaUrl: safeLinkSchema.optional(),
  }),
  z.object({
    ...optionalMetadata,
    type: z.literal("TrustBar"),
    items: z.array(localizedTextSchema).min(1).max(6),
  }),
  z.object({
    ...optionalMetadata,
    type: z.literal("RichText"),
    text: localizedTextSchema,
  }),
] as const;
export const homepageBlockSchema = z.discriminatedUnion("type", [
  ...legacyBlockSchemas,
  ...moda4BlockSchemas,
]);

export const homepageBlocksSchema = z
  .array(homepageBlockSchema)
  .max(30)
  .superRefine((blocks, ctx) => {
    const identities = blocks.flatMap((block) => (block.id ? [block.id] : []));
    if (new Set(identities).size !== identities.length)
      ctx.addIssue({ code: "custom", message: "Duplicate block identity" });
    const ids = blocks.flatMap((block) =>
      block.type === "ShopLook" ? block.looks.map((look) => look.id) : [],
    );
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Duplicate outfit identity" });
  });
export type HomepageBlock = z.infer<typeof homepageBlockSchema>;

async function getHomepageRows(marketId: string) {
  const where = {
    deletedAt: null,
    isPublished: true,
    OR: [{ marketId }, { marketId: null }],
  };
  // Read only the revisions outside Next's persistent cache. Prisma maintains
  // updatedAt for admin saves, seed and CLI upgrades alike, including updateMany.
  // Row identities also invalidate a cached fallback when an override is created,
  // removed or soft-deleted. No Next request context is required by those writers.
  const revisions = await db.homepage.findMany({
    where,
    select: { id: true, marketId: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
  return unstable_cache(
    () => db.homepage.findMany({ where, orderBy: { createdAt: "asc" } }),
    ["homepage-composition-v2", marketId, JSON.stringify(revisions)],
    { tags: ["homepage"] },
  )();
}

export async function getHomepage(marketId: string) {
  const rows = await getHomepageRows(marketId);
  const row =
    rows.find((candidate) => candidate.marketId === marketId) ??
    rows.find((candidate) => candidate.marketId === null);
  if (!row) return { id: null, marketId: null, blocks: [] as HomepageBlock[] };
  const parsed = homepageBlocksSchema.safeParse(row.blocks);
  return {
    id: row.id,
    marketId: row.marketId,
    blocks: parsed.success ? parsed.data : ([] as HomepageBlock[]),
  };
}

export function localizedValue(
  value: Partial<Record<"fa" | "tr" | "en", string>>,
  locale: "fa" | "tr" | "en",
) {
  return value[locale] || value.fa || value.en || "";
}
