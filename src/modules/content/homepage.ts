import { unstable_cache } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { localizedTextSchema, safeLinkSchema } from "./validation";

const mediaId = z.string().trim().min(1).max(100);
const sourceSchema = z.object({
  mode: z.enum(["latest", "bestseller", "category", "collection"]),
  referenceId: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(12).default(4),
});

export const homepageBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Hero"),
    mediaId: mediaId.optional(),
    title: localizedTextSchema,
    body: localizedTextSchema,
    ctaLabel: localizedTextSchema,
    ctaUrl: safeLinkSchema.optional(),
  }),
  z.object({
    type: z.literal("CategoryCards"),
    title: localizedTextSchema,
    source: sourceSchema,
  }),
  z.object({
    type: z.literal("ProductStrip"),
    title: localizedTextSchema,
    source: sourceSchema,
  }),
  z.object({
    type: z.literal("Banner"),
    mediaId: mediaId.optional(),
    title: localizedTextSchema,
    body: localizedTextSchema,
    ctaLabel: localizedTextSchema,
    ctaUrl: safeLinkSchema.optional(),
  }),
  z.object({
    type: z.literal("TrustBar"),
    items: z.array(localizedTextSchema).min(1).max(6),
  }),
  z.object({
    type: z.literal("RichText"),
    text: localizedTextSchema,
  }),
]);

export const homepageBlocksSchema = z.array(homepageBlockSchema).max(30);
export type HomepageBlock = z.infer<typeof homepageBlockSchema>;

async function getHomepageRows(marketId: string) {
  const where = { deletedAt: null, OR: [{ marketId }, { marketId: null }] };
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
