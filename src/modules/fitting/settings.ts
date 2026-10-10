import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { auth } from "@/modules/auth";
import { segmentQuery } from "@/modules/crm/segment-query";
import { membership } from "@/modules/crm/membership";
import { lockMediaReferences } from "@/modules/media/reference-lock";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import {
  assertCan,
  can,
  UnauthorizedError,
  evaluateAccess,
  ForbiddenError,
} from "@/modules/access";
import { configSchema, coins, FittingError } from "./contracts";
import { readConfig, lockWallet, grantCoins } from "./ledger";
async function actor() {
  const s = await auth();
  if (!s?.user?.id) throw new UnauthorizedError();
  await assertCan(s.user.id, "ai.settings.manage");
  return s.user.id;
}
export async function fittingSettings() {
  await actor();
  const config = await readConfig(db);
  return {
    config,
    keyReady: !!(
      process.env.FITTING_OPENAI_API_KEY || process.env.OPENAI_API_KEY
    ),
    integration:
      (
        await db.integration.findUnique({ where: { key: "fitting-room" } })
      )?.updatedAt.toISOString() ?? null,
    review: (
      await db.fittingSession.findMany({
        where: { status: "REVIEW" },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    ).map((s) => ({
      id: s.id,
      cost: s.costCoins.toString(),
      code: s.errorCode,
    })),
  };
}
export async function fittingRecipientMarkets() {
  const userId = await actor();
  const markets = await db.market.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const access = await Promise.all(
    markets.map(
      async (market) =>
        (await can(userId, "crm.customer.view", { marketId: market.id })) &&
        (await can(userId, "ai.settings.manage", { marketId: market.id })),
    ),
  );
  return markets.filter((_, index) => access[index]);
}
export async function fittingRecipients(marketId: string, search = "") {
  z.string().min(1).max(100).parse(marketId);
  z.string().max(100).parse(search);
  const userId = await actor();
  await assertCan(userId, "crm.customer.view", { marketId });
  await assertCan(userId, "ai.settings.manage", { marketId });
  if (!(await db.market.count({ where: { id: marketId, isActive: true } })))
    throw new FittingError("INVALID_SELECTION");
  return db.customer.findMany({
    where: {
      AND: [
        membership(marketId),
        { isActive: true, isGuest: false },
        search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 200,
  });
}
export async function saveFittingSettings(raw: unknown) {
  const v = z
      .object({
        config: configSchema,
        version: z.string().nullable(),
        confirm: z.literal(true),
      })
      .strict()
      .parse(raw),
    userId = await actor();
  if (
    v.config.enabled &&
    (!v.config.models.some((m) => m.enabled) ||
      (!process.env.FITTING_OPENAI_API_KEY && !process.env.OPENAI_API_KEY))
  )
    throw new FittingError("PROVIDER_UNAVAILABLE");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await txCan(tx, userId, "ai.settings.manage");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(75105)`;
      const old = await tx.integration.findUnique({
        where: { key: "fitting-room" },
      });
      if ((old?.updatedAt.toISOString() ?? null) !== v.version)
        throw new FittingError("STALE");
      try {
        await lockMediaReferences(
          tx,
          v.config.models.map((m) => m.mediaId),
          { readyImages: true },
        );
      } catch (error) {
        if (error instanceof z.ZodError)
          throw new FittingError("INVALID_SELECTION");
        throw error;
      }
      for (const r of v.config.rewards)
        if (
          !(await tx.market.count({
            where: { id: r.marketId, isActive: true },
          }))
        )
          throw new FittingError("INVALID_SELECTION");
      await tx.integration.upsert({
        where: { key: "fitting-room" },
        create: {
          key: "fitting-room",
          provider: "openai",
          isActive: v.config.enabled,
          config: v.config,
        },
        update: {
          provider: "openai",
          isActive: v.config.enabled,
          config: v.config,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "fitting.settings.save",
          entityType: "Integration",
          entityId: old?.id ?? "fitting-room",
          before: old?.config ?? undefined,
          after: v.config,
        },
      });
    }),
  );
}
const grantSchema = z
  .object({
    requestKey: z.string().uuid(),
    marketId: z.string().min(1).max(100),
    customerIds: z.array(z.string().min(1)).max(1000),
    segmentId: z.string().min(1).optional(),
    amount: coins.refine((v) => new Decimal(v).gt(0)),
    expiresAt: z.string().datetime().nullable(),
    reason: z.string().trim().min(1).max(300),
    confirm: z.literal(true),
  })
  .strict();
export async function grantFittingCoins(raw: unknown) {
  const input = grantSchema.parse(raw),
    userId = await actor();
  await assertCan(userId, "crm.customer.view", { marketId: input.marketId });
  await assertCan(userId, "ai.settings.manage", { marketId: input.marketId });
  const request = {
    marketId: input.marketId,
    customerIds: [...new Set(input.customerIds)].sort(),
    segmentId: input.segmentId ?? null,
    amount: input.amount,
    expiresAt: input.expiresAt,
    reason: input.reason,
  };
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({ userId, ...request }))
    .digest("hex");
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        await txCan(tx, userId, "ai.settings.manage", {
          marketId: input.marketId,
        });
        await txCan(tx, userId, "crm.customer.view", {
          marketId: input.marketId,
        });
        if (input.segmentId)
          await txCan(tx, userId, "crm.segment.manage", {
            marketId: input.marketId,
          });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.requestKey}))`;
        const prior = await tx.auditLog.findFirst({
          where: { action: "fitting.coins.grant", entityId: input.requestKey },
        });
        if (prior) {
          const previous = prior.after as {
            requestFingerprint?: string;
            marketId?: string;
            customerIds?: string[];
            amount?: string;
            expiresAt?: string | null;
            reason?: string;
          } | null;
          const same = previous?.requestFingerprint
            ? previous.requestFingerprint === requestFingerprint
            : prior.userId === userId &&
              !input.segmentId &&
              previous?.marketId === request.marketId &&
              previous.amount === request.amount &&
              previous.expiresAt === request.expiresAt &&
              previous.reason === request.reason &&
              JSON.stringify(previous.customerIds) ===
                JSON.stringify(request.customerIds);
          if (!same) throw new FittingError("REQUEST_CONFLICT");
          return;
        }
        if (input.expiresAt && new Date(input.expiresAt) <= new Date())
          throw new FittingError("INVALID_SELECTION");
        if (
          !(await tx.market.count({
            where: { id: input.marketId, isActive: true },
          }))
        )
          throw new FittingError("INVALID_SELECTION");
        let ids = request.customerIds;
        if (input.segmentId) {
          const segment = await tx.crmSegment.findFirst({
            where: { id: input.segmentId, marketId: input.marketId },
          });
          if (!segment) throw new FittingError("INVALID_SELECTION");
          await tx.$executeRaw`SET LOCAL statement_timeout='5000ms'`;
          const predicate = segmentQuery(segment.marketId, segment.definition);
          const members = await tx.$queryRaw<
            { id: string }[]
          >`SELECT c.id ${predicate} AND NOT c."isGuest" ORDER BY c.id LIMIT 1001`;
          if (members.length > 1000) throw new FittingError("GROUP_LIMIT");
          ids = members.map((m) => m.id);
        }
        if (!ids.length) throw new FittingError("INVALID_SELECTION");
        const users = await tx.customer.findMany({
          where: {
            AND: [
              membership(input.marketId),
              { id: { in: ids }, isActive: true, isGuest: false },
            ],
          },
          select: { id: true },
        });
        if (users.length !== ids.length)
          throw new FittingError("INVALID_SELECTION");
        const after = {
          request,
          requestFingerprint,
          marketId: input.marketId,
          customerIds: ids,
          amount: input.amount,
          expiresAt: input.expiresAt,
          reason: input.reason,
        };
        for (const customerId of ids) {
          await lockWallet(tx, customerId);
          await grantCoins(
            tx,
            customerId,
            `manual:${input.requestKey}`,
            "MANUAL",
            input.amount,
            input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {},
          );
        }
        await tx.auditLog.create({
          data: {
            userId,
            action: "fitting.coins.grant",
            entityType: "FittingWallet",
            entityId: input.requestKey,
            after,
          },
        });
      },
      { timeout: 30000 },
    ),
  );
}
export async function resolveFittingSession(raw: unknown) {
  const input = z
      .object({
        id: z.string().min(1),
        confirm: z.literal(true),
        refund: z.literal(true),
      })
      .parse(raw),
    userId = await actor();
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await txCan(tx, userId, "ai.settings.manage");
      await tx.$queryRaw`SELECT id FROM "FittingSession" WHERE id=${input.id} FOR UPDATE`;
      const s = await tx.fittingSession.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (s.status === "FAILED") return;
      if (s.status !== "REVIEW") throw new FittingError("STALE");
      const { refundSession } = await import("./index");
      await refundSession(tx, input.id, "ADMIN_REFUND");
      await tx.auditLog.create({
        data: {
          userId,
          action: "fitting.session.refund",
          entityType: "FittingSession",
          entityId: input.id,
          after: { costCoins: s.costCoins.toString() },
        },
      });
    }),
  );
}

async function txCan(
  tx: import("@prisma/client").Prisma.TransactionClient,
  id: string,
  permission: string,
  scope: import("@/modules/access").Scope = {},
) {
  const u = await tx.user.findUnique({
    where: { id },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!evaluateAccess(u, permission, scope))
    throw new ForbiddenError(permission, scope);
}
