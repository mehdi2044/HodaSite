import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { promotionRevisionSchema } from "./contracts";
import {
  couponStatusSchema,
  issueCouponsSchema,
  promotionIdSchema,
  PromotionError,
  requestHash,
  saveProgramSchema,
} from "./persistence-contracts";

export async function promotionAdmin(marketId: string) {
  promotionIdSchema.parse(marketId);
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  await assertCan(session.user.id, "pricing.sale_price.edit", { marketId });
  return session.user.id;
}

export async function lockProgram(
  tx: Prisma.TransactionClient,
  id: string,
  marketId: string,
) {
  await tx.$queryRaw`SELECT id FROM "PromotionProgram" WHERE id=${id} AND "marketId"=${marketId} FOR UPDATE`;
  const row = await tx.promotionProgram.findFirst({
    where: { id, marketId },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!row) throw new PromotionError("NOT_FOUND");
  return row;
}

async function mutationLock(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}

export async function savePromotionProgram(raw: unknown) {
  const input = saveProgramSchema.parse(raw);
  const actorId = await promotionAdmin(input.marketId);
  const hash = requestHash({ actorId, input });
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        await mutationLock(tx, input.mutationKey);
        const previous = await tx.promotionProgramRevision.findUnique({
          where: { mutationKey: input.mutationKey },
          include: { program: true },
        });
        if (previous) {
          if (
            previous.mutationHash !== hash ||
            previous.actorId !== actorId ||
            previous.program.marketId !== input.marketId
          )
            throw new PromotionError("IDEMPOTENCY_CONFLICT");
          return { id: previous.programId, version: previous.version };
        }
        if (!input.id)
          await tx.$queryRaw`SELECT id FROM "Market" WHERE id=${input.marketId} FOR UPDATE`;
        const market = await tx.market.findUniqueOrThrow({
          where: { id: input.marketId },
        });
        if (
          !input.id &&
          (await tx.promotionProgram.count({
            where: { marketId: input.marketId },
          })) >= 100
        )
          throw new PromotionError("LIMIT");
        const row = input.id
          ? await lockProgram(tx, input.id, input.marketId)
          : null;
        if (row && row.version !== input.expectedVersion)
          throw new PromotionError("STALE_VERSION");
        if (
          row &&
          promotionRevisionSchema.parse(row.revisions[0].config).status ===
            "ARCHIVED"
        )
          throw new PromotionError("ARCHIVED");
        const id = row?.id ?? randomUUID(),
          version = (row?.version ?? 0) + 1;
        const config = promotionRevisionSchema.parse({
          ...input.config,
          id,
          revision: version,
          marketId: input.marketId,
          currency: row?.currency ?? market.currency,
        });
        const productIds = [
          ...new Set([
            ...config.definition.selector.productIds,
            ...config.definition.selector.excludedProductIds,
            ...config.definition.conditions
              .filter((c) => c.field === "product")
              .map((c) => c.value),
          ]),
        ];
        if (
          productIds.length &&
          (await tx.product.count({
            where: {
              id: { in: productIds },
              deletedAt: null,
              marketIds: { has: input.marketId },
            },
          })) !== productIds.length
        )
          throw new PromotionError("INVALID_REFERENCE");
        const segments = config.definition.conditions
          .filter((c) => c.field === "segment")
          .map((c) => c.value);
        if (segments.length) {
          await assertCan(actorId, "crm.segment.manage", {
            marketId: input.marketId,
          });
          const count = await tx.crmSegment.count({
            where: { id: { in: segments }, marketId: input.marketId },
          });
          if (count !== new Set(segments).size)
            throw new PromotionError("INVALID_REFERENCE");
        }
        if (
          config.excludes.includes(id) ||
          (config.excludes.length &&
            (await tx.promotionProgram.count({
              where: { id: { in: config.excludes }, marketId: input.marketId },
            })) !== config.excludes.length)
        )
          throw new PromotionError("INVALID_REFERENCE");
        if (!row)
          await tx.promotionProgram.create({
            data: {
              id,
              marketId: input.marketId,
              currency: config.currency,
              version,
            },
          });
        else
          await tx.promotionProgram.update({
            where: { id },
            data: { version },
          });
        await tx.promotionProgramRevision.create({
          data: {
            programId: id,
            version,
            name: input.name,
            description: input.description,
            category: input.category,
            ownerNotes: input.ownerNotes,
            titleI18n: input.titleI18n,
            descriptionI18n: input.descriptionI18n,
            config,
            actorId,
            mutationKey: input.mutationKey,
            mutationHash: hash,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "promotion.program.save",
            entityType: "PromotionProgram",
            entityId: id,
            after: { marketId: input.marketId, version },
          },
        });
        return { id, version };
      },
      { isolationLevel: "ReadCommitted", timeout: 15000 },
    ),
  );
}

export async function listPromotionPrograms(marketId: string, page = 0) {
  await promotionAdmin(marketId);
  z.number().int().min(0).max(1000).parse(page);
  return db.promotionProgram.findMany({
    where: { marketId },
    orderBy: { id: "asc" },
    skip: page * 25,
    take: 26,
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });
}

export async function issuePromotionCoupons(raw: unknown) {
  const input = issueCouponsSchema.parse(raw),
    actorId = await promotionAdmin(input.marketId);
  const hash = requestHash({ actorId, input });
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        await mutationLock(tx, input.mutationKey);
        const old = await tx.promotionCoupon.findMany({
          where: { mutationKey: input.mutationKey },
          orderBy: { mutationIndex: "asc" },
        });
        if (old.length) {
          if (
            old.some(
              (c) =>
                c.mutationHash !== hash ||
                c.actorId !== actorId ||
                c.marketId !== input.marketId,
            )
          )
            throw new PromotionError("IDEMPOTENCY_CONFLICT");
          return old.map((c) => ({ id: c.id, code: c.code }));
        }
        const program = await lockProgram(tx, input.programId, input.marketId);
        const config = promotionRevisionSchema.parse(
          program.revisions[0].config,
        );
        if (config.status === "ARCHIVED") throw new PromotionError("ARCHIVED");
        if (!config.couponRequired)
          throw new PromotionError("INVALID_REFERENCE");
        const codes = input.generateCount
          ? Array.from({ length: input.generateCount }, () =>
              randomBytes(16).toString("hex").toUpperCase(),
            )
          : input.codes;
        const rows: { id: string; code: string }[] = [];
        for (const [index, code] of codes.entries()) {
          const row = await tx.promotionCoupon.create({
            data: {
              programId: program.id,
              marketId: input.marketId,
              code,
              startsAt: new Date(input.startsAt),
              endsAt: input.endsAt ? new Date(input.endsAt) : null,
              totalUsageCap: input.totalUsageCap,
              perCustomerCap: input.perCustomerCap,
              actorId,
              mutationKey: input.mutationKey,
              mutationIndex: index,
              mutationHash: hash,
            },
          });
          rows.push({ id: row.id, code: row.code });
        }
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "promotion.coupon.issue",
            entityType: "PromotionProgram",
            entityId: program.id,
            after: {
              marketId: input.marketId,
              count: rows.length,
              mutationKey: input.mutationKey,
            },
          },
        });
        return rows;
      },
      { isolationLevel: "ReadCommitted", timeout: 15000 },
    ),
  );
}

export async function setPromotionCouponStatus(raw: unknown) {
  const input = couponStatusSchema.parse(raw),
    actorId = await promotionAdmin(input.marketId);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        const found = await tx.promotionCoupon.findFirst({
          where: { id: input.id, marketId: input.marketId },
        });
        if (!found) throw new PromotionError("NOT_FOUND");
        await lockProgram(tx, found.programId, input.marketId);
        await tx.$queryRaw`SELECT id FROM "PromotionCoupon" WHERE id=${input.id} FOR UPDATE`;
        const row = await tx.promotionCoupon.findUniqueOrThrow({
          where: { id: input.id },
        });
        if (row.version !== input.expectedVersion)
          throw new PromotionError("STALE_VERSION");
        if (row.status === "ARCHIVED") throw new PromotionError("ARCHIVED");
        await tx.promotionCoupon.update({
          where: { id: row.id },
          data: { status: input.status, version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "promotion.coupon.status",
            entityType: "PromotionCoupon",
            entityId: row.id,
            before: { status: row.status, version: row.version },
            after: {
              marketId: row.marketId,
              status: input.status,
              version: row.version + 1,
            },
          },
        });
        return { id: row.id, version: row.version + 1 };
      },
      { isolationLevel: "ReadCommitted" },
    ),
  );
}
