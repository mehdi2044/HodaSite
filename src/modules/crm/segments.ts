import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { ForbiddenError } from "@/modules/access";
import { admin } from "./scope";
import { id, segmentSchema, type SegmentDefinition } from "./contracts";

import { segmentQuery } from "./segment-query";
export async function previewSegment(
  marketId: string,
  definition: unknown,
  page = 0,
) {
  await admin("crm.segment.manage", marketId);
  const offset = z.number().int().min(0).max(1000).parse(page) * 25;
  const predicate = segmentQuery(marketId, definition);
  return db.$transaction(
    async (tx) => {
      // Count and minimized preview share one MVCC snapshot and bounded execution time.
      await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
      const count = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) n ${predicate}`;
      const rows = await tx.$queryRaw<
        { id: string; locale: string }[]
      >`SELECT c.id, c.locale ${predicate} ORDER BY c.id LIMIT 25 OFFSET ${offset}`;
      return { count: Number(count[0].n), rows, page };
    },
    { isolationLevel: "RepeatableRead", timeout: 10000 },
  );
}
const saveSchema = z
  .object({
    marketId: id,
    id: id.optional(),
    version: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(100),
    definition: segmentSchema,
  })
  .strict();
export async function saveSegment(raw: unknown) {
  const input = saveSchema.parse(raw);
  const actorId = await admin("crm.segment.manage", input.marketId);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      if (input.id) {
        const changed = await tx.crmSegment.updateMany({
          where: {
            id: input.id,
            marketId: input.marketId,
            version: input.version ?? -1,
          },
          data: {
            name: input.name,
            definition: input.definition,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ForbiddenError("crm.segment.manage");
      }
      const row = input.id
        ? await tx.crmSegment.findUniqueOrThrow({ where: { id: input.id } })
        : await tx.crmSegment.create({
            data: {
              marketId: input.marketId,
              name: input.name,
              definition: input.definition,
            },
          });
      await tx.crmSegmentRevision.create({
        data: {
          segmentId: row.id,
          version: row.version,
          name: row.name,
          definition: row.definition as Prisma.InputJsonValue,
          actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "crm.segment.save",
          entityType: "CrmSegment",
          entityId: row.id,
          after: { marketId: row.marketId, version: row.version },
        },
      });
      return row.id;
    }),
  );
}
export async function listSegments(marketId: string, page = 0) {
  await admin("crm.segment.manage", marketId);
  z.number().int().min(0).max(1000).parse(page);
  return db.crmSegment.findMany({
    where: { marketId },
    take: 26,
    skip: page * 25,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}
export const emptySegment: SegmentDefinition = { version: 1, rules: [] };
