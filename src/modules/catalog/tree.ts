import { z } from "zod";
import type { Prisma } from "@prisma/client";
export function categoryRootId(
  rows: readonly { id: string; parentId: string | null }[],
  id: string,
): string | null {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let cursor = id;
  while (!seen.has(cursor)) {
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row) return null;
    if (!row.parentId) return row.id;
    cursor = row.parentId;
  }
  return null;
}
export async function validateCategoryParent(
  tx: Prisma.TransactionClient,
  id: string | undefined,
  parentId: string | undefined,
) {
  // Serialize all parent changes: two concurrent individually valid moves must not form a cycle.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(75106)`;
  const seen = new Set(id ? [id] : []);
  let cursor = parentId;
  while (cursor) {
    if (seen.has(cursor)) throw new z.ZodError([]);
    seen.add(cursor);
    const parent = await tx.category.findFirst({
      where: { id: cursor, deletedAt: null },
      select: { parentId: true },
    });
    if (!parent) throw new z.ZodError([]);
    cursor = parent.parentId ?? undefined;
  }
}
export function categoryPathLabel(
  rows: { id: string; parentId: string | null; titleI18n: unknown }[],
  id: string,
  locale: string,
) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>(),
    names: string[] = [];
  let cursor: string | null = id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row) break;
    const namesI18n = row.titleI18n as Record<string, string>;
    names.unshift(namesI18n[locale] ?? namesI18n.en ?? "");
    cursor = row.parentId;
  }
  return names.join(" / ");
}
