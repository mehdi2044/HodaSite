import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { can } from "@/modules/access";
import { admin, requireMember, membership } from "./scope";
import { id, calculateMetrics, metricsSchema } from "./contracts";

const paging = z.number().int().min(0).max(1000);
export async function listCustomers(marketId: string, page = 0, search = "") {
  await admin("crm.customer.view", marketId);
  paging.parse(page);
  z.string().max(100).parse(search);
  return db.customer.findMany({
    where: {
      AND: [
        membership(marketId),
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
    select: {
      id: true,
      firstName: true,
      lastName: true,
      locale: true,
      isActive: true,
    },
    take: 26,
    skip: page * 25,
    orderBy: { id: "asc" },
  });
}
export async function customer360(
  marketId: string,
  customerId: string,
  page = 0,
) {
  const actorId = await admin("crm.customer.view", marketId);
  await requireMember(customerId, marketId);
  paging.parse(page);
  const notesAllowed = await can(actorId, "crm.customer.notes", { marketId });
  const access = {
    notes: notesAllowed,
    tags: await can(actorId, "crm.customer.tags", { marketId }),
  };
  return db.$transaction(
    async (tx) => {
      const market = await tx.market.findUniqueOrThrow({
        where: { id: marketId },
        select: { code: true },
      });
      const profile = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          locale: true,
          isActive: true,
          createdAt: true,
          deletionRequestedAt: true,
        },
      });
      const common = { customerId, marketId };
      const paid: Prisma.OrderWhereInput = {
        ...common,
        kind: "SALE",
        paidAt: { not: null },
        status: { not: "CANCELLED" },
      };
      const [
        totals,
        config,
        tags,
        orders,
        returns,
        wishlist,
        carts,
        reviews,
        notes,
        consents,
      ] = await Promise.all([
        tx.order.aggregate({
          where: paid,
          _count: true,
          _sum: { totalAmountUsd: true },
          _max: { paidAt: true },
        }),
        tx.crmMetricsConfig.findUnique({ where: { marketId } }),
        tx.crmProfile.findUnique({
          where: { customerId_marketId: common },
          select: { tags: true },
        }),
        tx.order.findMany({
          where: common,
          select: {
            id: true,
            number: true,
            status: true,
            currency: true,
            totalAmount: true,
            placedAt: true,
          },
          orderBy: [{ placedAt: "desc" }, { id: "desc" }],
          skip: page * 25,
          take: 26,
        }),
        tx.returnRequest.findMany({
          where: { customerId, order: { marketId } },
          select: { id: true, status: true, type: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: page * 25,
          take: 26,
        }),
        tx.wishlist.findMany({
          where: common,
          select: {
            id: true,
            createdAt: true,
            product: { select: { titleI18n: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: page * 25,
          take: 26,
        }),
        tx.cart.findMany({
          where: common,
          select: {
            id: true,
            completedAt: true,
            expiresAt: true,
            updatedAt: true,
            _count: { select: { items: true } },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          skip: page * 25,
          take: 26,
        }),
        tx.review.findMany({
          where: common,
          select: {
            id: true,
            rating: true,
            status: true,
            createdAt: true,
            product: { select: { titleI18n: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: page * 25,
          take: 26,
        }),
        notesAllowed
          ? tx.crmNote.findMany({
              where: common,
              select: { id: true, body: true, createdAt: true },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              skip: page * 25,
              take: 26,
            })
          : [],
        tx.marketingConsent.findMany({
          where: common,
          select: {
            channel: true,
            status: true,
            source: true,
            updatedAt: true,
          },
        }),
      ]);
      const consentHistory = await tx.consentEvent.findMany({
        where: common,
        select: {
          id: true,
          channel: true,
          status: true,
          source: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page * 25,
        take: 26,
      });
      const timeline = await tx.$queryRaw<
        { id: string; kind: string; at: Date }[]
      >`
      SELECT * FROM (
        SELECT id, 'orders' AS kind, "placedAt" AS at FROM "Order" WHERE "customerId"=${customerId} AND "marketId"=${marketId}
        UNION ALL SELECT r.id, 'returns', r."createdAt" FROM "ReturnRequest" r JOIN "Order" o ON o.id=r."orderId" WHERE r."customerId"=${customerId} AND o."marketId"=${marketId}
        UNION ALL SELECT id, 'wishlist', "createdAt" FROM "Wishlist" WHERE "customerId"=${customerId} AND "marketId"=${marketId}
        UNION ALL SELECT id, 'carts', "updatedAt" FROM "Cart" WHERE "customerId"=${customerId} AND "marketId"=${marketId}
        UNION ALL SELECT id, 'reviews', "createdAt" FROM "Review" WHERE "customerId"=${customerId} AND "marketId"=${marketId}
        UNION ALL SELECT id, 'consent', "createdAt" FROM "ConsentEvent" WHERE "customerId"=${customerId} AND "marketId"=${marketId}
      ) events ORDER BY at DESC, kind, id DESC LIMIT 26 OFFSET ${page * 25}`;
      const metrics = calculateMetrics(
        {
          count: totals._count,
          valueUsd: totals._sum.totalAmountUsd?.toString() ?? "0",
          lastPaidAt: totals._max.paidAt,
        },
        config?.definition,
      );
      return {
        market,
        profile,
        access,
        tags: tags?.tags ?? [],
        metrics,
        orders,
        returns,
        wishlist,
        carts,
        reviews,
        notes,
        consents,
        consentHistory,
        timeline,
        next: [
          orders,
          returns,
          wishlist,
          carts,
          reviews,
          notes,
          timeline,
          consentHistory,
        ].some((xs) => xs.length > 25),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function addNote(raw: unknown) {
  const input = z
    .object({
      customerId: id,
      marketId: id,
      body: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(raw);
  const actorId = await admin("crm.customer.notes", input.marketId);
  await admin("crm.customer.view", input.marketId);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await requireMember(input.customerId, input.marketId, tx);
      const row = await tx.crmNote.create({ data: { ...input, actorId } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "crm.note.created",
          entityType: "CrmNote",
          entityId: row.id,
          after: { marketId: input.marketId },
        },
      });
      return row.id;
    }),
  );
}
export async function setTags(raw: unknown) {
  const input = z
    .object({
      customerId: id,
      marketId: id,
      tags: z.array(z.string().trim().min(1).max(60)).max(30),
    })
    .strict()
    .parse(raw);
  const actorId = await admin("crm.customer.tags", input.marketId);
  await admin("crm.customer.view", input.marketId);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await requireMember(input.customerId, input.marketId, tx);
      const tags = [...new Set(input.tags)].sort();
      const row = await tx.crmProfile.upsert({
        where: {
          customerId_marketId: {
            customerId: input.customerId,
            marketId: input.marketId,
          },
        },
        create: { ...input, tags },
        update: { tags },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "crm.tags.updated",
          entityType: "CrmProfile",
          entityId: row.id,
          after: { marketId: input.marketId, count: tags.length },
        },
      });
    }),
  );
}
export async function getMetricsConfig(marketId: string) {
  await admin("crm.metrics.manage", marketId);
  return db.crmMetricsConfig.findUnique({ where: { marketId } });
}
export async function saveMetricsConfig(raw: unknown) {
  const input = z
    .object({ marketId: id, definition: metricsSchema })
    .strict()
    .parse(raw);
  const actorId = await admin("crm.metrics.manage", input.marketId);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"crm-metrics:" + input.marketId}))::text`;
      const before = await tx.crmMetricsConfig.findUnique({
        where: { marketId: input.marketId },
      });
      const row = await tx.crmMetricsConfig.upsert({
        where: { marketId: input.marketId },
        create: input,
        update: { definition: input.definition },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "crm.metrics.updated",
          entityType: "CrmMetricsConfig",
          entityId: row.id,
          before: before?.definition ?? Prisma.JsonNull,
          after: { marketId: input.marketId, definition: input.definition },
        },
      });
    }),
  );
}
