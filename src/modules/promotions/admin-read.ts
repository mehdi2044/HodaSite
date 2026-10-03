import { z } from "zod";
import { db } from "@/lib/db";
import { can, assertCan } from "@/modules/access";
import { promotionAdmin } from "./persistence";
import { promotionIdSchema, PromotionError } from "./persistence-contracts";
import { promotionRevisionSchema } from "./contracts";

export async function promotionEditorData(marketId: string, id?: string) {
  const actor = await promotionAdmin(marketId);
  if (id) promotionIdSchema.parse(id);
  const market = await db.market.findUniqueOrThrow({
    where: { id: marketId },
    select: { currency: true },
  });
  const saved = id
    ? await db.promotionProgram.findFirst({
        where: { id, marketId },
        include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : null;
  if (id && !saved) throw new PromotionError("NOT_FOUND");
  const segmentAllowed = await can(actor, "crm.segment.manage", { marketId });
  const config = saved
    ? promotionRevisionSchema.parse(saved.revisions[0].config)
    : null;
  const [products, categories, collections, segments, programs] =
    await Promise.all([
      db.product.findMany({
        where: { deletedAt: null },
        select: { id: true, titleI18n: true },
        orderBy: { id: "asc" },
        take: 1000,
      }),
      db.category.findMany({
        where: { deletedAt: null },
        select: { id: true, titleI18n: true },
        orderBy: { id: "asc" },
        take: 1000,
      }),
      db.collection.findMany({
        where: { deletedAt: null },
        select: { id: true, titleI18n: true },
        orderBy: { id: "asc" },
        take: 1000,
      }),
      segmentAllowed
        ? db.crmSegment.findMany({
            where: { marketId },
            select: { id: true, name: true },
            orderBy: { id: "asc" },
            take: 1000,
          })
        : [],
      db.promotionProgram.findMany({
        where: { marketId },
        select: {
          id: true,
          revisions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { name: true },
          },
        },
        orderBy: { id: "asc" },
        take: 100,
      }),
    ]);
  return {
    currency: market.currency,
    products,
    categories,
    collections,
    segments,
    programs: programs
      .filter((p) => p.id !== id)
      .map((p) => ({ id: p.id, name: p.revisions[0].name })),
    segmentAllowed,
    saved:
      saved && config
        ? {
            id: saved.id,
            version: saved.version,
            name: saved.revisions[0].name,
            description: saved.revisions[0].description,
            category: saved.revisions[0].category,
            ownerNotes: saved.revisions[0].ownerNotes,
            titleI18n: saved.revisions[0].titleI18n,
            descriptionI18n: saved.revisions[0].descriptionI18n,
            config,
          }
        : null,
  };
}

export async function listPromotionCoupons(
  marketId: string,
  programId: string,
  page = 0,
) {
  await promotionAdmin(marketId);
  promotionIdSchema.parse(programId);
  z.number().int().min(0).max(1000).parse(page);
  if (
    !(await db.promotionProgram.findFirst({
      where: { id: programId, marketId },
      select: { id: true },
    }))
  )
    throw new PromotionError("NOT_FOUND");
  return db.promotionCoupon.findMany({
    where: { marketId, programId },
    orderBy: { id: "asc" },
    skip: page * 25,
    take: 26,
    select: {
      id: true,
      code: true,
      version: true,
      status: true,
      startsAt: true,
      endsAt: true,
      totalUsageCap: true,
      perCustomerCap: true,
    },
  });
}

export async function promotionHistory(
  marketId: string,
  programId: string,
  page = 0,
) {
  await promotionAdmin(marketId);
  promotionIdSchema.parse(programId);
  z.number().int().min(0).max(1000).parse(page);
  return db.promotionProgramRevision.findMany({
    where: { programId, program: { marketId } },
    orderBy: { version: "desc" },
    skip: page * 25,
    take: 26,
    select: { version: true, name: true, createdAt: true, config: true },
  });
}

export async function promotionSampleCarts(marketId: string, page = 0) {
  const actor = await promotionAdmin(marketId);
  await assertCan(actor, "crm.customer.view", { marketId });
  await assertCan(actor, "crm.segment.manage", { marketId });
  z.number().int().min(0).max(1000).parse(page);
  // No tokens, checkout addresses, email, tags or consent values leave this service.
  return db.cart.findMany({
    where: {
      marketId,
      completedAt: null,
      expiresAt: { gt: new Date() },
      items: { some: {} },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: page * 25,
    take: 26,
    select: {
      id: true,
      locale: true,
      createdAt: true,
      customer: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
  });
}
