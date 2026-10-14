import { Prisma } from "@prisma/client";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { withMutation } from "@/lib/mutation-gate";
export const KIDS_TONES = [
  "kidsPink",
  "kidsMint",
  "kidsSky",
  "kidsButter",
  "kidsLilac",
  "kidsPeach",
] as const;
export const categoryPresentationSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["default", "kids"]),
    tone: z.enum(KIDS_TONES).default("kidsMint"),
  })
  .strict();
export type CategoryPresentation = z.infer<typeof categoryPresentationSchema>;
export const inheritedCategoryPresentation = cache(
  async (categoryId: string): Promise<CategoryPresentation | null> => {
    // No business depth limit; guard retained malformed cycles in the path itself.
    const rows = await db.$queryRaw<
      { presentation: Prisma.JsonValue | null; deletedAt: Date | null }[]
    >`
    WITH RECURSIVE ancestors AS (
      SELECT id,"parentId",presentation,"deletedAt",ARRAY[id] AS path,0 AS depth FROM "Category" WHERE id=${categoryId}
      UNION ALL SELECT p.id,p."parentId",p.presentation,p."deletedAt",a.path || p.id,a.depth+1
      FROM "Category" p JOIN ancestors a ON p.id=a."parentId" WHERE NOT p.id=ANY(a.path)
    ) SELECT presentation,"deletedAt" FROM ancestors ORDER BY depth`;
    if (rows.some((row) => row.deletedAt)) return null;
    for (const row of rows) {
      const value = categoryPresentationSchema.safeParse(row.presentation);
      if (value.success) return value.data;
    }
    return null;
  },
);
export async function saveCategoryPresentation(actorId: string, raw: unknown) {
  await assertCan(actorId, "catalog.product.edit");
  const input = z
    .object({
      id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      expectedUpdatedAt: z.string().datetime(),
      presentation: categoryPresentationSchema.nullable(),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${input.id} FOR UPDATE`;
      const before = await tx.category.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!before || before.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new RevisionConflictError();
      await assertCan(actorId, "catalog.product.edit");
      const after = await tx.category.update({
        where: { id: input.id },
        data: { presentation: input.presentation ?? Prisma.DbNull },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "catalog.category.presentation",
          entityType: "Category",
          entityId: input.id,
          before: before.presentation ?? Prisma.DbNull,
          after: after.presentation ?? Prisma.DbNull,
        },
      });
      return { id: after.id, updatedAt: after.updatedAt.toISOString() };
    }),
  );
}
