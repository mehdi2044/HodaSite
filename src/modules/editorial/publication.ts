import { Prisma, type EditorialEntry } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { assertCan } from "@/modules/access";
import { lockMediaReferences } from "@/modules/media/reference-lock";
import {
  editorialContent,
  entrySlugs,
  type EditorialContent,
} from "./contracts";

type Tx = Prisma.TransactionClient;

async function audit(
  tx: Tx,
  userId: string,
  action: string,
  id: string,
  after: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: {
      userId,
      action: "content.editorial." + action,
      entityType: "EditorialEntry",
      entityId: id,
      after,
    },
  });
}

async function checkedEntry(tx: Tx, id: string, version: number) {
  await tx.$queryRaw`SELECT id FROM "EditorialEntry" WHERE id = ${id} FOR UPDATE`;
  const entry = await tx.editorialEntry.findUnique({ where: { id } });
  if (!entry || entry.version !== version) throw new RevisionConflictError();
  return entry;
}

async function validateReferences(
  tx: Tx,
  content: EditorialContent,
  publish: boolean,
) {
  const blocks = content.kind === "ARTICLE" ? content.blocks : [];
  const imageIds = [
    ...new Set(
      [
        content.mediaId,
        content.mobileMediaId,
        ...(content.kind === "ARTICLE" ? [content.ogMediaId] : []),
        ...blocks.flatMap((block) =>
          block.type === "IMAGE" ? [block.mediaId] : [],
        ),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  await lockMediaReferences(tx, imageIds, { readyImages: true });
  const markets = await tx.market.findMany({
    where: content.marketIds.length
      ? { id: { in: content.marketIds }, isActive: true }
      : { isActive: true },
    select: { id: true },
  });
  if (content.marketIds.length && markets.length !== content.marketIds.length)
    throw new z.ZodError([]);
  if (
    (await tx.media.count({
      where: {
        id: { in: imageIds },
        kind: "image",
        status: "READY",
        deletedAt: null,
      },
    })) !== imageIds.length
  )
    throw new z.ZodError([]);
  if (content.kind === "LOOK") {
    const variants = await tx.variant.findMany({
      where: {
        id: { in: content.items.map((item) => item.variantId) },
        isActive: true,
        color: { deletedAt: null },
        size: { deletedAt: null },
        product: {
          status: "ACTIVE",
          deletedAt: null,
          coinPackCoins: null,
          category: { deletedAt: null },
        },
      },
      select: {
        id: true,
        productId: true,
        product: { select: { marketIds: true } },
      },
    });
    if (
      content.items.some(
        (item) =>
          !variants.some(
            (v) =>
              v.id === item.variantId &&
              v.productId === item.productId &&
              (!publish ||
                markets.every((market) =>
                  v.product.marketIds.includes(market.id),
                )),
          ),
      )
    )
      throw new z.ZodError([]);
  } else {
    const lookIds = [
      ...new Set(
        blocks.flatMap((block) => (block.type === "LOOK" ? [block.id] : [])),
      ),
    ];
    const productIds = [
      ...new Set(
        blocks.flatMap((block) => (block.type === "PRODUCT" ? [block.id] : [])),
      ),
    ];
    if (
      (await tx.editorialEntry.count({
        where: { id: { in: lookIds }, kind: "LOOK", deletedAt: null },
      })) !== lookIds.length ||
      (await tx.product.count({
        where: {
          id: { in: productIds },
          deletedAt: null,
          status: "ACTIVE",
          coinPackCoins: null,
        },
      })) !== productIds.length
    )
      throw new z.ZodError([]);
  }
}

async function append(
  tx: Tx,
  entry: EditorialEntry,
  number: number,
  body: EditorialContent,
  userId: string,
) {
  return tx.editorialRevision.create({
    data: {
      entryId: entry.id,
      number,
      body,
      authorId: userId,
      ...(body.kind === "LOOK"
        ? {
            items: {
              create: body.items.map(({ productId }, position) => ({
                productId,
                position,
              })),
            },
          }
        : {}),
    },
  });
}

export async function saveEditorialDraft(
  userId: string,
  input: { id?: string; version: number; slugs?: unknown; body: unknown },
) {
  await assertCan(userId, "content.page.write");
  const body = editorialContent.parse(input.body);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      let entry: EditorialEntry;
      if (input.id) {
        entry = await checkedEntry(tx, input.id, input.version);
        if (entry.kind !== body.kind) throw new z.ZodError([]);
        entry = await tx.editorialEntry.update({
          where: { id: entry.id },
          data: { version: { increment: 1 } },
        });
      } else {
        const slugs = entrySlugs.parse(input.slugs);
        entry = await tx.editorialEntry.create({
          data: {
            kind: body.kind,
            slugFa: slugs.fa,
            slugTr: slugs.tr,
            slugEn: slugs.en,
          },
        });
      }
      await validateReferences(tx, body, false);
      const revision = await append(tx, entry, entry.version, body, userId);
      await audit(tx, userId, "draft", entry.id, {
        revisionId: revision.id,
        version: entry.version,
      });
      return entry;
    }),
  ).catch((error: unknown) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new RevisionConflictError();
    throw error;
  });
}

export async function publishEditorial(
  userId: string,
  input: { id: string; version: number; revisionId: string; date?: Date },
) {
  await assertCan(userId, "content.page.publish");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const entry = await checkedEntry(tx, input.id, input.version);
      const revision = await tx.editorialRevision.findFirst({
        where: { id: input.revisionId, entryId: entry.id, approvedBy: null },
      });
      if (!revision) throw new RevisionConflictError();
      const now = new Date();
      if (input.date && input.date <= now) throw new z.ZodError([]);
      if (
        await tx.editorialRevision.count({
          where: { entryId: entry.id, number: { gt: revision.number } },
        })
      )
        throw new RevisionConflictError();
      await validateReferences(tx, editorialContent.parse(revision.body), true);
      await tx.editorialRevision.update({
        where: { id: revision.id },
        data: { approvedBy: userId, visibleFrom: input.date ?? now },
      });
      await tx.editorialEntry.update({
        where: { id: entry.id },
        data: { version: { increment: 1 }, deletedAt: null },
      });
      await audit(tx, userId, input.date ? "schedule" : "publish", entry.id, {
        revisionId: revision.id,
        visibleFrom: (input.date ?? now).toISOString(),
      });
    }),
  );
}

export async function archiveEditorial(
  userId: string,
  id: string,
  version: number,
) {
  await assertCan(userId, "content.page.publish");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await checkedEntry(tx, id, version);
      await tx.editorialEntry.update({
        where: { id },
        data: {
          version: { increment: 1 },
          deletedAt: new Date(),
          minVisibleVersion: version + 1,
        },
      });
      await audit(tx, userId, "archive", id, { version });
    }),
  );
}
