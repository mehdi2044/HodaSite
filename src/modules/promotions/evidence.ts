import { Prisma } from "@prisma/client";
import { promotionCustomerEvidence } from "@/modules/crm";
import {
  PromotionDecimal as D,
  promotionRevisionSchema,
  type PromotionContext,
} from "./contracts";
import { evaluatePromotions } from "./evaluate";
import { couponCodesSchema, PromotionError } from "./persistence-contracts";

export type TrustedPromotionCart = Pick<
  PromotionContext,
  "marketId" | "currency" | "locale" | "items" | "shippingAmount"
>;

/** Internal only: never pass browser-provided amounts, identity or evidence. */
export async function evaluateStoredPromotions(
  tx: Prisma.TransactionClient,
  cart: TrustedPromotionCart,
  verifiedCustomerId: string | null,
  rawCodes: unknown,
  lock: boolean,
  simulateProgramId?: string,
) {
  const codes = couponCodesSchema.parse(rawCodes);
  if (lock)
    await tx.$queryRaw`SELECT id FROM "Market" WHERE id=${cart.marketId} FOR SHARE`;
  if (lock)
    await tx.$queryRaw`SELECT id FROM "PromotionProgram" WHERE "marketId"=${cart.marketId} ORDER BY id FOR UPDATE`;
  const programs = await tx.promotionProgram.findMany({
    where: { marketId: cart.marketId },
    orderBy: { id: "asc" },
    take: 101,
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (programs.length > 100) throw new PromotionError("LIMIT");
  const revisions = programs.map((p) => {
    const config = promotionRevisionSchema.parse(p.revisions[0]?.config);
    if (
      config.id !== p.id ||
      config.revision !== p.version ||
      config.marketId !== p.marketId ||
      config.currency !== p.currency
    )
      throw new PromotionError("INVALID_REFERENCE");
    return p.id === simulateProgramId
      ? { ...config, enabled: true, status: "ACTIVE" as const }
      : config;
  });
  if (simulateProgramId && !programs.some((p) => p.id === simulateProgramId))
    throw new PromotionError("NOT_FOUND");
  const segments = [
    ...new Set(
      revisions.flatMap((p) =>
        p.definition.conditions
          .filter((c) => c.field === "segment")
          .map((c) => c.value),
      ),
    ),
  ];
  if (segments.length > 100) throw new PromotionError("LIMIT");
  const customer = verifiedCustomerId
    ? await promotionCustomerEvidence(
        tx,
        cart.marketId,
        verifiedCustomerId,
        segments,
      )
    : null;
  if (lock && codes.length)
    await tx.$queryRaw`SELECT id FROM "PromotionCoupon" WHERE "marketId"=${cart.marketId} AND code IN (${Prisma.join(codes)}) ORDER BY id FOR UPDATE`;
  const coupons = await tx.promotionCoupon.findMany({
    where: { marketId: cart.marketId, code: { in: codes } },
    orderBy: { id: "asc" },
  });
  // Use database time *after* potentially waiting for locks.
  const [clock] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  const now = clock.now;
  const liveUsage = {
    evaluation: { release: null },
  } satisfies Prisma.PromotionRedemptionWhereInput;
  const usage: PromotionContext["usage"] = [];
  for (const p of programs) {
    const stats = await tx.promotionRedemption.aggregate({
      where: { programId: p.id, ...liveUsage },
      _count: true,
      _sum: { amount: true },
    });
    usage.push({
      promotionId: p.id,
      revision: p.version,
      totalUsed: stats._count,
      spent: stats._sum.amount?.toFixed(4) ?? "0",
      customerId: verifiedCustomerId,
      customerUsed: verifiedCustomerId
        ? await tx.promotionRedemption.count({
            where: {
              programId: p.id,
              evaluation: {
                release: null,
                order: { customerId: verifiedCustomerId },
              },
            },
          })
        : null,
    });
  }
  const verifiedCoupons: PromotionContext["verifiedCoupons"] = [];
  const couponByProgram = new Map<string, string>();
  for (const coupon of coupons) {
    const p = revisions.find((r) => r.id === coupon.programId);
    if (
      !p?.couponRequired ||
      couponByProgram.has(p.id) ||
      coupon.status !== "ACTIVE" ||
      now < coupon.startsAt ||
      (coupon.endsAt && now >= coupon.endsAt)
    )
      continue;
    if (coupon.perCustomerCap !== null && !verifiedCustomerId) continue;
    const used = await tx.promotionRedemption.count({
      where: { couponId: coupon.id, ...liveUsage },
    });
    if (coupon.totalUsageCap !== null && used >= coupon.totalUsageCap) continue;
    if (
      coupon.perCustomerCap !== null &&
      (await tx.promotionRedemption.count({
        where: {
          couponId: coupon.id,
          evaluation: {
            release: null,
            order: { customerId: verifiedCustomerId! },
          },
        },
      })) >= coupon.perCustomerCap
    )
      continue;
    couponByProgram.set(p.id, coupon.id);
    verifiedCoupons.push({ promotionId: p.id, revision: p.revision });
  }
  const result = evaluatePromotions(revisions, {
    ...cart,
    now: now.toISOString(),
    customer,
    usage,
    verifiedCoupons,
  });
  // Keep JSON evidence exact even at numeric(18,4)'s upper bound.
  if (new D(result.discountTotal).isNegative())
    throw new PromotionError("ORDER_MISMATCH");
  return { result, couponByProgram, programs };
}
