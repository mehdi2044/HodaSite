import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { quoteSavedCart } from "@/modules/fees";
import { promotionContextSchema, PromotionDecimal as D } from "./contracts";
import { promotionAdmin } from "./persistence";
import {
  couponCodesSchema,
  promotionIdSchema,
  PromotionError,
} from "./persistence-contracts";
import { evaluateStoredPromotions } from "./evidence";

const simulatorSchema = z
  .object({
    marketId: promotionIdSchema,
    cartId: promotionIdSchema,
    couponCodes: couponCodesSchema,
    previewProgramId: promotionIdSchema.optional(),
  })
  .strict();

/** Read-only admin estimate. Saved cart prices and CRM evidence are server-loaded. */
export async function simulatePromotionCart(raw: unknown) {
  const input = simulatorSchema.parse(raw),
    actorId = await promotionAdmin(input.marketId);
  // Carts are customer records even when a guest has not yet signed in.
  await assertCan(actorId, "crm.customer.view", { marketId: input.marketId });
  await assertCan(actorId, "crm.segment.manage", { marketId: input.marketId });
  const cart = await db.cart.findFirst({
    where: {
      id: input.cartId,
      marketId: input.marketId,
      completedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      items: {
        include: {
          variant: { include: { product: { include: { collections: true } } } },
        },
      },
    },
  });
  if (!cart) throw new PromotionError("NOT_FOUND");
  const quote = await quoteSavedCart(
    {
      marketId: cart.marketId,
      locale: z.enum(["fa", "tr", "en"]).parse(cart.locale),
      items: cart.items,
    },
    cart.checkout,
  );
  const context = promotionContextSchema.parse({
    marketId: cart.marketId,
    currency: quote.currency,
    locale: cart.locale,
    now: new Date().toISOString(),
    items: quote.items.map((i) => {
      const v = cart.items.find((c) => c.variantId === i.variantId)!.variant;
      return {
        variantId: v.id,
        productId: v.productId,
        categoryId: v.product.categoryId,
        collectionIds: v.product.collections.map((c) => c.id),
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      };
    }),
    shippingAmount: quote.lines
      .filter((l) => l.type === "SHIPPING" && !l.absorbed)
      .reduce((s, l) => s.add(l.amount), new D(0))
      .toFixed(4),
    customer: null,
    usage: [],
    verifiedCoupons: [],
  });
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
      const { result } = await evaluateStoredPromotions(
        tx,
        context,
        cart.customerId,
        input.couponCodes,
        false,
        input.previewProgramId,
      );
      return {
        estimateOnly: true as const,
        previewProgramId: input.previewProgramId ?? null,
        result,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
