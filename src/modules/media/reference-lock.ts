import { Prisma } from "@prisma/client";
import { z } from "zod";

/** JSON/scalar references have no FK. Hold the same key-share lock as an FK
 * until the writer commits, so purge cannot pass its reference check meanwhile.
 * Existing soft-deleted references remain valid (including draft/trash content).
 */
export async function lockMediaReferences(
  tx: Prisma.TransactionClient,
  ids: readonly (string | null | undefined)[],
): Promise<void> {
  const unique = [
    ...new Set(ids.filter((id): id is string => Boolean(id))),
  ].sort();
  if (!unique.length) return;
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "Media" WHERE id IN (${Prisma.join(unique)})
    ORDER BY id FOR KEY SHARE
  `);
  if (rows.length !== unique.length) throw new z.ZodError([]);
}

export function blockMediaIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(blockMediaIds);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "mediaId" && typeof item === "string"
      ? [item]
      : blockMediaIds(item),
  );
}
