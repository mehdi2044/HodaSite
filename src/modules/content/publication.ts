import {
  moda4ReferenceProducts,
  validateModa4References,
} from "./moda4-references";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { assertCan } from "@/modules/access";
import { validateLookReferences } from "@/modules/outfits";
import { blockMediaIds } from "@/modules/media";
import { homepageBlocksSchema, type HomepageBlock } from "./homepage";
import {
  sceneReferenceFingerprint,
  assertPhotoMatch,
  lockSceneCatalog,
} from "./scenes/references";

import { lockSceneMediaReferences } from "./scenes/composite";

import {
  blockScenes,
  mapBlockScenes,
  bindBlockVideoScenes,
} from "./block-scenes";

const identity = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const version = z.number().int().min(0).max(2147483646);
const draftInput = z
  .object({
    marketId: identity.nullable(),
    expectedVersion: version,
    blocks: homepageBlocksSchema,
    confirmSceneIds: z.array(identity).max(360).default([]),
    expectedSceneFingerprints: z
      .array(
        z
          .object({
            sceneId: identity,
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(360)
      .default([]),
  })
  .strict();
const publishInput = z
  .object({
    homepageId: identity,
    revisionId: identity,
    expectedVersion: version,
    jobId: identity.optional(),
  })
  .strict();
export const REVISION_FORMAT = "homepage-revision-v1";
type Tx = Prisma.TransactionClient;
const scope = (marketId: string | null) =>
  marketId ? { marketId } : undefined;
const scenes = blockScenes;

async function lockScope(tx: Tx, marketId: string | null) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`homepage:${marketId ? `market:${marketId}` : "global"}`}))::text`;
  const row = await tx.homepage.findFirst({
    where: { marketId, deletedAt: null },
  });
  if (row)
    await tx.$queryRaw`SELECT id FROM "Homepage" WHERE id=${row.id} FOR UPDATE`;
  return row
    ? await tx.homepage.findUniqueOrThrow({ where: { id: row.id } })
    : null;
}
async function requiredMarkets(tx: Tx, marketId: string | null) {
  if (marketId) {
    const market = await tx.market.findFirst({
      where: { id: marketId, isActive: true },
    });
    if (!market) throw new z.ZodError([]);
    return [market.id];
  }
  return (
    await tx.market.findMany({
      where: {
        isActive: true,
        homepages: {
          none: { isPublished: true, deletedAt: null, marketId: { not: null } },
        },
      },
      select: { id: true },
    })
  ).map((m) => m.id);
}
async function validatedBlocks(
  tx: Tx,
  blocks: HomepageBlock[],
  marketId: string | null,
  previous: HomepageBlock[] = [],
  confirmed: string[] = [],
  publish = false,
  expected: { sceneId: string; fingerprint: string }[] = [],
) {
  blocks = bindBlockVideoScenes(blocks);
  const all = scenes(blocks);
  const activeBlocks = blocks.filter((block) => block.enabled !== false);
  const allScenes = scenes(activeBlocks);
  if (
    new Set(all.map((s) => s.id)).size !== all.length ||
    confirmed.some((id) => !allScenes.some((s) => s.id === id))
  )
    throw new z.ZodError([]);
  const markets = await requiredMarkets(tx, marketId);
  // All scene Product locks are acquired in one sorted set first. Per-scene
  // locks then cannot reverse product order across shared pieces.
  const products = [
    ...new Set([
      ...moda4ReferenceProducts(activeBlocks),
      ...allScenes.flatMap((s) => s.pieces.map((p) => p.productId)),
      ...activeBlocks.flatMap((b) =>
        b.type === "ShopLook"
          ? b.looks.flatMap((look) => look.items.map((i) => i.productId))
          : [],
      ),
    ]),
  ].sort();
  if (products.length)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(products)}) ORDER BY id FOR UPDATE`,
    );
  for (const block of activeBlocks) {
    if (
      block.type !== "ProductStrip" ||
      (block.source.mode !== "category" && block.source.mode !== "collection")
    )
      continue;
    const referenceId = block.source.referenceId;
    if (!referenceId) throw new z.ZodError([]);
    const refs =
      block.source.mode === "category"
        ? await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "Category" WHERE id=${referenceId} AND "deletedAt" IS NULL FOR SHARE`
        : await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "Collection" WHERE id=${referenceId} AND "deletedAt" IS NULL FOR SHARE`;
    if (!refs.length) throw new z.ZodError([]);
  }
  await validateLookReferences(
    activeBlocks.filter((block) => !(block.type === "ShopLook" && block.scene)),
    marketId,
    tx,
  );
  await validateModa4References(tx, activeBlocks, marketId, markets, publish);
  await lockSceneCatalog(allScenes, tx);
  await lockSceneMediaReferences(
    allScenes,
    tx,
    blockMediaIds(activeBlocks),
    activeBlocks.flatMap((block) =>
      block.type === "VideoBanner" ? [block.videoMediaId] : [],
    ),
    blockMediaIds(blocks),
  );
  const matches = new Map<
    string,
    Awaited<ReturnType<typeof sceneReferenceFingerprint>>
  >();
  for (const scene of [...allScenes].sort((a, b) => a.id.localeCompare(b.id)))
    matches.set(scene.id, await sceneReferenceFingerprint(scene, markets, tx));
  if (
    !publish &&
    confirmed.some(
      (id) =>
        !expected.some(
          (proof) =>
            proof.sceneId === id && proof.fingerprint === matches.get(id),
        ),
    )
  )
    throw new RevisionConflictError();
  return mapBlockScenes(blocks, (scene) => {
    const fingerprint = matches.get(scene.id);
    if (!fingerprint)
      return {
        ...scene,
        match: scenes(previous).find((old) => old.id === scene.id)?.match,
      };
    if (publish) {
      assertPhotoMatch(scene, fingerprint);
      return scene;
    }
    const old = scenes(previous).find((s) => s.id === scene.id);
    const match =
      scene.mode === "COMPOSITE" || confirmed.includes(scene.id)
        ? { fingerprint, confirmedAt: new Date().toISOString() }
        : old?.match?.fingerprint === fingerprint
          ? old.match
          : undefined;
    return { ...scene, match };
  });
}
function revisionBlocks(value: Prisma.JsonValue | null) {
  const row = value as { format?: unknown; blocks?: unknown } | null;
  if (row?.format !== REVISION_FORMAT) throw new z.ZodError([]);
  return homepageBlocksSchema.parse(row.blocks);
}
export async function saveHomepageDraft(actorId: string, raw: unknown) {
  const input = draftInput.parse(raw);
  await assertCan(actorId, "content.homepage.write", scope(input.marketId));
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const before = await lockScope(tx, input.marketId);
      await assertCan(actorId, "content.homepage.write", scope(input.marketId));
      if ((before?.version ?? 0) !== input.expectedVersion)
        throw new RevisionConflictError();
      const old = homepageBlocksSchema.safeParse(
        before?.draftBlocks ?? before?.blocks ?? [],
      );
      const blocks = await validatedBlocks(
        tx,
        input.blocks,
        input.marketId,
        old.success ? old.data : [],
        input.confirmSceneIds,
        false,
        input.expectedSceneFingerprints,
      );
      await assertCan(actorId, "content.homepage.write", scope(input.marketId));
      const row =
        before ??
        (await tx.homepage.create({
          data: { marketId: input.marketId, isPublished: false },
        }));
      let baselineId: string | null = null;
      if (row.isPublished && !row.publishedRevisionId) {
        const baseline = await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "content.homepage.revision",
            entityType: "Homepage",
            entityId: row.id,
            after: {
              format: REVISION_FORMAT,
              blocks: row.blocks as Prisma.InputJsonValue,
              version: row.version,
              baseline: true,
            },
          },
        });
        baselineId = baseline.id;
      }
      const nextVersion = row.version + 1;
      const revision = await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "content.homepage.revision",
          entityType: "Homepage",
          entityId: row.id,
          after: {
            format: REVISION_FORMAT,
            blocks: blocks as unknown as Prisma.InputJsonValue,
            version: nextVersion,
            parentRevisionId:
              row.draftRevisionId ?? row.publishedRevisionId ?? baselineId,
          },
        },
      });
      await tx.homepage.update({
        where: { id: row.id },
        data: {
          draftBlocks: blocks as unknown as Prisma.InputJsonValue,
          draftRevisionId: revision.id,
          version: nextVersion,
          ...(baselineId ? { publishedRevisionId: baselineId } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "content.homepage.draft_saved",
          entityType: "Homepage",
          entityId: row.id,
          after: { version: nextVersion, revisionId: revision.id },
        },
      });
      return { id: row.id, version: nextVersion, revisionId: revision.id };
    }),
  );
}
export async function publishHomepageRevision(actorId: string, raw: unknown) {
  const input = publishInput.parse(raw);
  const candidate = await db.homepage.findFirstOrThrow({
    where: { id: input.homepageId, deletedAt: null },
  });
  await assertCan(actorId, "content.homepage.write", scope(candidate.marketId));
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const row = await lockScope(tx, candidate.marketId);
      if (!row || row.id !== input.homepageId)
        throw new RevisionConflictError();
      await assertCan(actorId, "content.homepage.write", scope(row.marketId));
      if (
        input.jobId &&
        (await tx.auditLog.findFirst({
          where: {
            entityType: "Homepage",
            entityId: row.id,
            action: "content.homepage.published",
            after: { path: ["jobId"], equals: input.jobId },
          },
        }))
      )
        return { id: row.id, version: row.version, replay: true };
      if (row.version !== input.expectedVersion)
        throw new RevisionConflictError();
      if (
        input.jobId &&
        (row.scheduledRevisionId !== input.revisionId ||
          row.scheduledVersion !== input.expectedVersion ||
          row.scheduledById !== actorId ||
          !row.scheduledAt ||
          row.scheduledAt > new Date())
      )
        throw new RevisionConflictError();
      const revision = await tx.auditLog.findFirstOrThrow({
        where: {
          id: input.revisionId,
          entityType: "Homepage",
          entityId: row.id,
          action: "content.homepage.revision",
        },
      });
      const blocks = await validatedBlocks(
        tx,
        revisionBlocks(revision.after),
        row.marketId,
        [],
        [],
        true,
      );
      await assertCan(actorId, "content.homepage.write", scope(row.marketId));
      const nextVersion = row.version + 1;
      await tx.homepage.update({
        where: { id: row.id },
        data: {
          blocks: blocks as unknown as Prisma.InputJsonValue,
          isPublished: true,
          publishedRevisionId: revision.id,
          version: nextVersion,
          scheduledAt: null,
          scheduledRevisionId: null,
          scheduledById: null,
          scheduledVersion: null,
          scheduleError: null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "content.homepage.published",
          entityType: "Homepage",
          entityId: row.id,
          before: { revisionId: row.publishedRevisionId, version: row.version },
          after: {
            revisionId: revision.id,
            version: nextVersion,
            jobId: input.jobId ?? null,
          },
        },
      });
      return { id: row.id, version: nextVersion, replay: false };
    }),
  );
}
export async function scheduleHomepageRevision(actorId: string, raw: unknown) {
  const input = publishInput
    .omit({ jobId: true })
    .extend({ at: z.date() })
    .parse(raw);
  if (
    input.at <= new Date() ||
    input.at.getTime() > Date.now() + 366 * 86400000
  )
    throw new z.ZodError([]);
  const candidate = await db.homepage.findFirstOrThrow({
    where: { id: input.homepageId, deletedAt: null },
  });
  await assertCan(actorId, "content.homepage.write", scope(candidate.marketId));
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const row = await lockScope(tx, candidate.marketId);
      if (
        !row ||
        row.id !== input.homepageId ||
        row.version !== input.expectedVersion
      )
        throw new RevisionConflictError();
      await assertCan(actorId, "content.homepage.write", scope(row.marketId));
      const revision = await tx.auditLog.findFirstOrThrow({
        where: {
          id: input.revisionId,
          entityType: "Homepage",
          entityId: row.id,
          action: "content.homepage.revision",
        },
      });
      await validatedBlocks(
        tx,
        revisionBlocks(revision.after),
        row.marketId,
        [],
        [],
        true,
      );
      await assertCan(actorId, "content.homepage.write", scope(row.marketId));
      const nextVersion = row.version + 1;
      await tx.homepage.update({
        where: { id: row.id },
        data: {
          scheduledRevisionId: revision.id,
          scheduledAt: input.at,
          scheduledById: actorId,
          scheduledVersion: nextVersion,
          version: nextVersion,
          scheduleError: null,
        },
      });
      const job = await tx.job.create({
        data: {
          type: "homepage-publish",
          runAt: input.at,
          payload: {
            homepageId: row.id,
            revisionId: revision.id,
            actorId,
            expectedVersion: nextVersion,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "content.homepage.scheduled",
          entityType: "Homepage",
          entityId: row.id,
          after: {
            revisionId: revision.id,
            version: nextVersion,
            at: input.at.toISOString(),
            jobId: job.id,
          },
        },
      });
      return { id: row.id, version: nextVersion, jobId: job.id };
    }),
  );
}
export async function homepageRevisionHistory(
  actorId: string,
  homepageId: string,
  after?: string,
) {
  const row = await db.homepage.findFirstOrThrow({
    where: { id: identity.parse(homepageId), deletedAt: null },
  });
  await assertCan(actorId, "content.homepage.read", scope(row.marketId));
  const cursor = after
    ? await db.auditLog.findFirstOrThrow({
        where: {
          id: identity.parse(after),
          entityType: "Homepage",
          entityId: row.id,
          action: "content.homepage.revision",
        },
      })
    : null;
  return db.auditLog.findMany({
    where: {
      entityType: "Homepage",
      entityId: row.id,
      action: "content.homepage.revision",
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });
}
