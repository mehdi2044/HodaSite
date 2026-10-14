import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  evaluateAccess,
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { homepageBlocksSchema } from "./homepage";
export const homepagePreviewInput = z
  .object({
    channel: z.uuid(),
    scopeMarketId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .nullable(),
    marketId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    locale: z.enum(["fa", "tr", "en"]),
    sequence: z.number().int().min(1).max(2147483646),
    blocks: homepageBlocksSchema,
  })
  .strict();
const hash = (channel: string) =>
  createHash("sha256").update(z.uuid().parse(channel)).digest("hex");
async function permission(
  ownerId: string,
  scopeMarketId: string | null,
  client: Prisma.TransactionClient = db,
) {
  const scope = scopeMarketId ? { marketId: scopeMarketId } : undefined;
  const user = await client.user.findUnique({
    where: { id: ownerId },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!evaluateAccess(user, "content.homepage.read", scope))
    throw new ForbiddenError("content.homepage.read", scope);
}
/** This is private ephemeral preparation, never a saved CMS draft/publication. */
export async function prepareHomepagePreview(ownerId: string, raw: unknown) {
  const input = homepagePreviewInput.parse(raw);
  if (input.scopeMarketId && input.scopeMarketId !== input.marketId)
    throw new UnauthorizedError();
  await permission(ownerId, input.scopeMarketId);
  const channelHash = hash(input.channel);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`homepage-preview-owner:${ownerId}`},0))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`homepage-preview:${channelHash}`},0))::text`;
      const previous = await tx.homepagePreview.findUnique({
        where: { channelHash },
      });
      if (
        previous &&
        (previous.ownerId !== ownerId ||
          previous.scopeMarketId !== input.scopeMarketId)
      )
        throw new UnauthorizedError();
      if (
        !(await tx.market.count({
          where: {
            id: input.marketId,
            isActive: true,
            enabledLocales: { has: input.locale },
          },
        }))
      )
        throw new z.ZodError([]);
      await permission(ownerId, input.scopeMarketId, tx);
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const now = clock.now;
      // Permission is checked before acknowledging a late request too.
      if (
        previous &&
        previous.expiresAt > now &&
        previous.sequence >= input.sequence
      )
        return { sequence: previous.sequence, accepted: false };
      await tx.homepagePreview.deleteMany({
        where: { ownerId, expiresAt: { lte: now } },
      });
      if (!previous || previous.expiresAt <= now) {
        if ((await tx.homepagePreview.count({ where: { ownerId } })) >= 20)
          throw new z.ZodError([]);
      }
      const data = {
        marketId: input.marketId,
        locale: input.locale,
        sequence: input.sequence,
        blocks: input.blocks as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(now.getTime() + 3600000),
      };
      await tx.homepagePreview.upsert({
        where: { channelHash },
        create: {
          ...data,
          channelHash,
          ownerId,
          scopeMarketId: input.scopeMarketId,
        },
        update: data,
      });
      return { sequence: input.sequence, accepted: true };
    }),
  );
}
export async function readHomepagePreview(ownerId: string, channel: string) {
  const channelHash = hash(channel);
  const row = await db.homepagePreview.findUnique({ where: { channelHash } });
  if (!row || row.ownerId !== ownerId) throw new UnauthorizedError();
  await permission(ownerId, row.scopeMarketId);
  const [clock] = await db.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  if (
    row.expiresAt <= clock.now ||
    (row.scopeMarketId && row.scopeMarketId !== row.marketId)
  )
    throw new UnauthorizedError();
  const market = await db.market.findFirst({
    where: {
      id: row.marketId,
      isActive: true,
      enabledLocales: { has: row.locale },
    },
  });
  if (!market) throw new UnauthorizedError();
  return {
    market,
    locale: z.enum(["fa", "tr", "en"]).parse(row.locale),
    blocks: homepageBlocksSchema.parse(row.blocks),
    sequence: row.sequence,
  };
}
