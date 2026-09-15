import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { currentCustomer } from "@/modules/customers";
import { UnauthorizedError, ForbiddenError, assertCan } from "@/modules/access";
import {
  catalogText,
  catalogProductInclude,
  formatCatalogCurrency,
} from "@/modules/catalog";
import { getDisplayPrices } from "@/modules/pricing";
import { seoPath } from "@/lib/seo-urls";
export const engagementContext = z.object({
  marketId: z.string().min(1).max(100),
  locale: z.enum(["fa", "tr", "en"]),
});
const idsSchema = z.array(z.string().min(1).max(100)).max(100);
export async function engagementMarket(raw: unknown) {
  const input = engagementContext.parse(raw);
  const market = await db.market.findFirst({
    where: {
      id: input.marketId,
      isActive: true,
      enabledLocales: { has: input.locale },
    },
  });
  if (!market) throw new ForbiddenError("engagement");
  return { ...input, market };
}
async function customer() {
  const c = await currentCustomer();
  if (!c || c.isGuest) throw new UnauthorizedError();
  return c;
}
export async function publicCards(raw: unknown, rawIds: unknown) {
  const { market, locale } = await engagementMarket(raw);
  const ids = idsSchema.parse(rawIds);
  const products = await db.product.findMany({
    where: {
      id: { in: ids },
      status: "ACTIVE",
      deletedAt: null,
      marketIds: { has: market.id },
    },
    include: catalogProductInclude,
  });
  const prices = await getDisplayPrices(products, market);
  return Promise.all(
    products
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
      .map(async (p) => ({
        id: p.id,
        title: catalogText(p.titleI18n, locale),
        href: seoPath(
          locale,
          market.code,
          "p",
          catalogText(p.slugI18n, locale),
        ),
        image:
          p.media.find((m) => !m.media.deletedAt && m.media.status === "READY")
            ?.media.url ?? null,
        price: formatCatalogCurrency(
          prices.get(p.id)!.amount,
          market.currency as "IRT" | "TRY" | "CAD" | "USD",
          locale,
        ),
      })),
  );
}
export async function wishlist(raw: unknown) {
  const { marketId } = await engagementMarket(raw);
  const c = await currentCustomer();
  if (!c || c.isGuest) return { authenticated: false, ids: [] as string[] };
  const rows = await db.wishlist.findMany({
    where: { customerId: c.id, marketId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { productId: true },
  });
  return { authenticated: true, ids: rows.map((r) => r.productId) };
}
export async function mergeWishlist(raw: unknown, rawIds: unknown) {
  const { marketId } = await engagementMarket(raw),
    c = await customer(),
    ids = idsSchema.parse(rawIds);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${c.id} FOR UPDATE`;
      const existing = await tx.wishlist.count({
        where: { customerId: c.id, marketId },
      });
      const products = await tx.product.findMany({
        where: {
          id: { in: ids },
          status: "ACTIVE",
          deletedAt: null,
          marketIds: { has: marketId },
          wishlists: { none: { customerId: c.id, marketId } },
        },
        take: Math.max(0, 100 - existing),
        select: { id: true },
      });
      if (products.length)
        await tx.wishlist.createMany({
          data: products.map((p) => ({
            customerId: c.id,
            marketId,
            productId: p.id,
          })),
          skipDuplicates: true,
        });
    }),
  );
  return wishlist(raw);
}
export async function removeWishlist(raw: unknown, productId: string) {
  const { marketId } = await engagementMarket(raw),
    c = await customer();
  await withMutation(() =>
    db.wishlist.deleteMany({
      where: {
        customerId: c.id,
        marketId,
        productId: z.string().max(100).parse(productId),
      },
    }),
  );
  return wishlist(raw);
}
export const reviewInput = z.object({
  productId: z.string().min(1).max(100),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(3).max(4000),
});
export async function submitReview(raw: unknown, value: unknown) {
  const { marketId, locale } = await engagementMarket(raw),
    c = await customer(),
    input = reviewInput.parse(value);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${c.id} FOR UPDATE`;
      const product = await tx.product.findFirst({
        where: {
          id: input.productId,
          deletedAt: null,
          status: "ACTIVE",
          marketIds: { has: marketId },
        },
      });
      if (!product) throw new ForbiddenError("engagement");
      const paid = await tx.orderItem.findFirst({
        where: {
          variant: { productId: product.id },
          order: {
            customerId: c.id,
            marketId,
            paidAt: { not: null },
            status: {
              notIn: [
                "CANCELLED",
                "PENDING_PAYMENT",
                "AWAITING_VERIFICATION",
                "NEEDS_REVIEW",
              ],
            },
          },
        },
        select: { id: true },
      });
      const data = {
        rating: input.rating,
        body: input.body,
        locale,
        status: "PENDING",
        verifiedPurchase: Boolean(paid),
        reply: "",
        moderatedAt: null,
        moderatedBy: null,
      };
      return tx.review.upsert({
        where: {
          customerId_productId_marketId: {
            customerId: c.id,
            productId: product.id,
            marketId,
          },
        },
        create: { ...data, customerId: c.id, productId: product.id, marketId },
        update: data,
        select: { id: true },
      });
    }),
  );
}
export async function publicReviews(raw: unknown, productId: string) {
  const { marketId, locale } = await engagementMarket(raw);
  const where = {
    productId,
    marketId,
    locale,
    status: "APPROVED",
    customer: { isActive: true },
    product: {
      status: "ACTIVE" as const,
      deletedAt: null,
      marketIds: { has: marketId },
    },
  };
  const [items, aggregate] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        rating: true,
        body: true,
        reply: true,
        verifiedPurchase: true,
        createdAt: true,
        photos: {
          where: { media: { deletedAt: null, status: "READY" } },
          select: { id: true },
        },
      },
    }),
    db.review.aggregate({
      where,
      _count: { rating: true },
      _avg: { rating: true },
    }),
  ]);
  return {
    items,
    count: aggregate._count.rating,
    rating: aggregate._avg.rating,
  };
}
export async function moderateReview(userId: string, raw: unknown) {
  await assertCan(userId, "content.page.publish");
  const input = z
    .object({
      id: z.string().max(100),
      status: z.enum(["APPROVED", "REJECTED"]),
      reply: z.string().trim().max(2000),
      updatedAt: z.coerce.date(),
    })
    .parse(raw);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      const before = await tx.review.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (before.updatedAt.getTime() !== input.updatedAt.getTime())
        throw new ForbiddenError("engagement");
      const result = await tx.review.updateMany({
        where: { id: input.id, updatedAt: input.updatedAt },
        data: {
          status: input.status,
          reply: input.reply,
          moderatedBy: userId,
          moderatedAt: new Date(),
        },
      });
      if (result.count !== 1) throw new ForbiddenError("engagement");
      await tx.auditLog.create({
        data: {
          userId,
          action: "review.moderate",
          entityType: "Review",
          entityId: input.id,
          before: { status: before.status },
          after: { status: input.status, hasReply: Boolean(input.reply) },
        },
      });
    }),
  );
}
export async function setStockAlert(raw: unknown, value: unknown) {
  const { marketId, locale } = engagementContext.parse(raw),
    c = await customer();
  const { variantId, active } = z
    .object({ variantId: z.string().max(100), active: z.boolean() })
    .parse(value);
  if (active) await engagementMarket(raw);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${c.id} FOR UPDATE`;
      if (!active) {
        await tx.stockAlert.updateMany({
          where: { customerId: c.id, variantId, marketId },
          data: { active: false },
        });
        return;
      }
      const variant = await tx.variant.findFirst({
        where: {
          id: variantId,
          isActive: true,
          product: {
            status: "ACTIVE",
            deletedAt: null,
            marketIds: { has: marketId },
          },
        },
        include: { stockItems: true },
      });
      if (!variant || variant.stockItems.some((s) => s.onHand - s.reserved > 0))
        throw new ForbiddenError("engagement");
      const where = {
        customerId_variantId_marketId: {
          customerId: c.id,
          variantId,
          marketId,
        },
      };
      const old = await tx.stockAlert.findUnique({ where });
      if (old?.active && !old.notifiedAt) return;
      if (
        (await tx.stockAlert.count({
          where: { customerId: c.id, active: true },
        })) >= 100
      )
        throw new ForbiddenError("engagement");
      await tx.stockAlert.upsert({
        where,
        create: { customerId: c.id, variantId, marketId, locale },
        update: {
          active: true,
          notifiedAt: null,
          generation: { increment: 1 },
          locale,
        },
      });
    }),
  );
}
