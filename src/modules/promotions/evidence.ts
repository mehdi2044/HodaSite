import { Prisma } from "@prisma/client";
import { promotionCustomerEvidence } from "@/modules/crm/promotion-server";
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
  verifiedSelfCheckout = false,
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
  const eligible = revisions.filter(
    (p) =>
      p.enabled &&
      (p.status === "ACTIVE" || p.status === "SCHEDULED") &&
      p.currency === cart.currency &&
      now >= new Date(p.startsAt) &&
      (p.endsAt === null || now < new Date(p.endsAt)),
  );
  const segments = [
    ...new Set(
      eligible.flatMap((p) =>
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
        verifiedSelfCheckout,
      )
    : null;
  const candidates = coupons.filter(
    (coupon) =>
      eligible.some((p) => p.id === coupon.programId && p.couponRequired) &&
      coupon.status === "ACTIVE" &&
      now >= coupon.startsAt &&
      (!coupon.endsAt || now < coupon.endsAt) &&
      (coupon.perCustomerCap === null || verifiedCustomerId !== null),
  );
  const totalCouponIds = candidates
    .filter((c) => c.totalUsageCap !== null)
    .map((c) => c.id);
  const customerCouponIds = candidates
    .filter((c) => c.perCustomerCap !== null)
    .map((c) => c.id);
  const couponTotals = totalCouponIds.length
    ? await tx.promotionRedemption.groupBy({
        by: ["couponId"],
        where: { couponId: { in: totalCouponIds }, ...liveUsage },
        _count: { _all: true },
      })
    : [];
  const couponCustomers =
    verifiedCustomerId && customerCouponIds.length
      ? await tx.promotionRedemption.groupBy({
          by: ["couponId"],
          where: {
            couponId: { in: customerCouponIds },
            evaluation: {
              release: null,
              order: { customerId: verifiedCustomerId },
            },
          },
          _count: { _all: true },
        })
      : [];
  const couponTotalById = new Map(
    couponTotals.map((s) => [s.couponId, s._count._all]),
  );
  const couponCustomerById = new Map(
    couponCustomers.map((s) => [s.couponId, s._count._all]),
  );
  const verifiedCoupons: PromotionContext["verifiedCoupons"] = [];
  const couponByProgram = new Map<string, string>();
  for (const coupon of candidates) {
    if (couponByProgram.has(coupon.programId)) continue;
    if (
      coupon.totalUsageCap !== null &&
      (couponTotalById.get(coupon.id) ?? 0) >= coupon.totalUsageCap
    )
      continue;
    if (
      coupon.perCustomerCap !== null &&
      (couponCustomerById.get(coupon.id) ?? 0) >= coupon.perCustomerCap
    )
      continue;
    const p = eligible.find((p) => p.id === coupon.programId)!;
    couponByProgram.set(p.id, coupon.id);
    verifiedCoupons.push({ promotionId: p.id, revision: p.revision });
  }
  const limited = eligible.filter(
    (p) =>
      (p.totalUsageCap !== null ||
        p.perCustomerCap !== null ||
        p.budget !== null) &&
      (!p.couponRequired || couponByProgram.has(p.id)) &&
      (p.perCustomerCap === null || verifiedCustomerId !== null),
  );
  const totalProgramIds = limited
    .filter((p) => p.totalUsageCap !== null || p.budget !== null)
    .map((p) => p.id);
  const customerProgramIds = limited
    .filter((p) => p.perCustomerCap !== null)
    .map((p) => p.id);
  // Lifetime usage spans revisions; released unpaid orders never consume capacity.
  // At most four aggregate queries cover all program and coupon limits.
  const totals = totalProgramIds.length
    ? await tx.promotionRedemption.groupBy({
        by: ["programId"],
        where: { programId: { in: totalProgramIds }, ...liveUsage },
        _count: { _all: true },
        _sum: { amount: true },
      })
    : [];
  const customers =
    verifiedCustomerId && customerProgramIds.length
      ? await tx.promotionRedemption.groupBy({
          by: ["programId"],
          where: {
            programId: { in: customerProgramIds },
            evaluation: {
              release: null,
              order: { customerId: verifiedCustomerId },
            },
          },
          _count: { _all: true },
        })
      : [];
  const totalById = new Map(totals.map((s) => [s.programId, s]));
  const customerById = new Map(
    customers.map((s) => [s.programId, s._count._all]),
  );
  const usage: PromotionContext["usage"] = limited.map((p) => ({
    promotionId: p.id,
    revision: p.revision,
    totalUsed: totalById.get(p.id)?._count._all ?? 0,
    spent: totalById.get(p.id)?._sum.amount?.toFixed(4) ?? "0",
    customerId: verifiedCustomerId,
    customerUsed:
      p.perCustomerCap !== null && verifiedCustomerId
        ? (customerById.get(p.id) ?? 0)
        : null,
  }));
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
