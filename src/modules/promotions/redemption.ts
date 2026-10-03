import { Prisma } from "@prisma/client";
import { PromotionDecimal as D, promotionContextSchema } from "./contracts";
import {
  couponCodesSchema,
  PromotionError,
  requestHash,
} from "./persistence-contracts";
import { evaluateStoredPromotions } from "./evidence";

/**
 * INTERNAL transaction adapter, deliberately not exported from index or a Server
 * Action. Caller must own/authenticate the order, use withMutation and a
 * ReadCommitted transaction. No checkout caller is wired until D71 fee/refund
 * integration is complete. Never accepts precomputed discounts or CRM claims.
 */
export async function redeemOrderPromotions(
  tx: Prisma.TransactionClient,
  orderId: string,
  verifiedCustomerId: string | null,
  rawCodes: unknown,
) {
  const codes = couponCodesSchema.parse(rawCodes);
  const hash = requestHash({ verifiedCustomerId, codes });
  const [isolation] = await tx.$queryRaw<
    { transaction_isolation: string }[]
  >`SHOW transaction_isolation`;
  if (isolation.transaction_isolation !== "read committed")
    throw new PromotionError("ORDER_MISMATCH");
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: {
        include: {
          variant: { include: { product: { include: { collections: true } } } },
        },
      },
      fees: true,
      payments: true,
      promotionEvaluation: true,
    },
  });
  if (verifiedCustomerId && verifiedCustomerId !== order.customerId)
    throw new PromotionError("ORDER_MISMATCH");
  if (order.promotionEvaluation) {
    if (order.promotionEvaluation.requestHash !== hash)
      throw new PromotionError("IDEMPOTENCY_CONFLICT");
    return order.promotionEvaluation.result;
  }
  if (
    order.status !== "PENDING_PAYMENT" ||
    order.paidAt ||
    order.kind !== "SALE" ||
    order.payments.some((p) => p.status === "APPROVED")
  )
    throw new PromotionError("ORDER_MISMATCH");
  const context = promotionContextSchema.parse({
    marketId: order.marketId,
    currency: order.currency,
    locale: order.locale,
    now: new Date().toISOString(),
    items: order.items.map((i) => ({
      variantId: i.variantId,
      productId: i.variant.productId,
      categoryId: i.variant.product.categoryId,
      collectionIds: i.variant.product.collections.map((c) => c.id),
      quantity: i.quantity,
      unitPrice: i.unitPriceAmount.toFixed(4),
    })),
    shippingAmount: order.fees
      .filter((f) => f.type === "SHIPPING" && !f.absorbed)
      .reduce((s, f) => s.add(f.amount.toString()), new D(0))
      .toFixed(4),
    customer: null,
    usage: [],
    verifiedCoupons: [],
  });
  const evaluated = await evaluateStoredPromotions(
    tx,
    context,
    verifiedCustomerId,
    codes,
    true,
  );
  const { result, couponByProgram, programs } = evaluated;
  const feeTotal = order.fees
    .filter((f) => !f.absorbed)
    .reduce((s, f) => s.add(f.amount.toString()), new D(0));
  if (
    !new D(result.subtotal).eq(order.subtotalAmount.toString()) ||
    !new D(result.discountTotal).eq(order.discountAmount.toString()) ||
    !feeTotal.eq(order.feeTotalAmount.toString()) ||
    !new D(result.subtotal)
      .add(feeTotal)
      .sub(result.discountTotal)
      .eq(order.totalAmount.toString()) ||
    order.items.some(
      (i) =>
        i.currency !== order.currency ||
        !new D(i.unitPriceAmount.toString())
          .mul(i.quantity)
          .eq(i.lineTotalAmount.toString()),
    ) ||
    order.fees.some((f) => f.currency !== order.currency)
  )
    throw new PromotionError("ORDER_MISMATCH");
  const evidence = await tx.promotionOrderEvaluation.create({
    data: {
      orderId,
      requestHash: hash,
      result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
    },
  });
  for (const line of result.lines) {
    const revision = programs.find((p) => p.id === line.promotionId)!
      .revisions[0];
    await tx.promotionRedemption.create({
      data: {
        evaluationId: evidence.id,
        programId: line.promotionId,
        revision: line.revision,
        couponId: couponByProgram.get(line.promotionId),
        amount: line.amount,
        currency: line.currency,
        snapshot: JSON.parse(
          JSON.stringify({
            ...line,
            titleI18n: revision.titleI18n,
            descriptionI18n: revision.descriptionI18n,
          }),
        ) as Prisma.InputJsonValue,
      },
    });
  }
  return evidence.result;
}

/** Caller already authorizes cancellation and locks Order before this helper. */
export async function releaseCancelledOrderPromotions(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payments: true,
      promotionEvaluation: { include: { release: true, redemptions: true } },
    },
  });
  const evaluation = order.promotionEvaluation;
  if (!evaluation) return;
  if (
    order.status !== "CANCELLED" ||
    order.paidAt ||
    order.payments.some((p) => p.status === "APPROVED")
  )
    throw new PromotionError("RELEASE_FORBIDDEN");
  if (evaluation.release) return;
  const ids = evaluation.redemptions.map((r) => r.programId).sort();
  if (ids.length)
    await tx.$queryRaw`SELECT id FROM "PromotionProgram" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  await tx.promotionUsageRelease.create({
    data: { evaluationId: evaluation.id, reason: "CANCELLED_UNPAID" },
  });
}
