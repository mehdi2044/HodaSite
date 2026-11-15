import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import type { WeeklyLookSlot } from "@prisma/client";
import { z } from "zod";
import { assertCan } from "@/modules/access";
import { publishedEntry } from "./queries";

export async function saveWeeklyLook(
  userId: string,
  input: { id: string; slot: WeeklyLookSlot; startsAt: Date; endsAt: Date },
) {
  await assertCan(userId, "content.page.publish");
  if (input.startsAt >= input.endsAt || input.endsAt <= new Date())
    throw new z.ZodError([]);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"editorial.weekly." + input.slot}))`;
      await tx.$queryRaw`SELECT id FROM "EditorialEntry" WHERE id = ${input.id} FOR SHARE`;
      const target = await tx.editorialEntry.findFirst({
        where: { id: input.id, kind: "LOOK", deletedAt: null },
        include: {
          revisions: {
            where: { visibleFrom: { lte: input.startsAt } },
            orderBy: { number: "desc" },
            take: 1,
          },
        },
      });
      const active = target?.revisions[0];
      const body = active?.body;
      if (
        !target ||
        !active ||
        active.number < target.minVisibleVersion ||
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        (input.slot !== "MAIN" && body.audience !== input.slot)
      )
        throw new z.ZodError([]);
      if (
        await tx.weeklyLookFeature.count({
          where: {
            slot: input.slot,
            startsAt: { lt: input.endsAt },
            endsAt: { gt: input.startsAt },
          },
        })
      )
        throw new z.ZodError([]);
      const row = await tx.weeklyLookFeature.create({
        data: {
          entryId: input.id,
          slot: input.slot,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          authorId: userId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "content.editorial.weekly",
          entityType: "WeeklyLookFeature",
          entityId: row.id,
          after: {
            entryId: input.id,
            slot: row.slot,
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt.toISOString(),
          },
        },
      });
    }),
  );
}

export async function weeklyLooks(
  marketId: string,
  archive = false,
  now = new Date(),
) {
  const rows = await db.weeklyLookFeature.findMany({
    where: archive
      ? { endsAt: { lte: now } }
      : { startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    take: archive ? 48 : 5,
  });
  const resolved = await Promise.all(
    rows.map(async (row) => {
      const entry = await publishedEntry("LOOK", { id: row.entryId }, marketId);
      return entry?.body.kind === "LOOK" &&
        (row.slot === "MAIN" || entry.body.audience === row.slot)
        ? { row, look: { ...entry, body: entry.body } }
        : null;
    }),
  );
  return resolved.flatMap((entry) => (entry ? [entry] : []));
}
