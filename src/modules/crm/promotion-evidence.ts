import { Prisma } from "@prisma/client";
import { requireMember } from "./membership";
import { segmentQuery } from "./segment-query";

/** Internal 09B consumer. Identity must already be verified by its caller. */
export async function promotionCustomerEvidence(
  tx: Prisma.TransactionClient,
  marketId: string,
  customerId: string,
  segmentIds: string[],
  verifiedSelfCheckout = false,
) {
  // A verified shopper may make their first purchase in a new market. Admin
  // simulation still requires existing membership. All CRM queries stay scoped.
  if (!verifiedSelfCheckout) await requireMember(customerId, marketId, tx);
  const customer = await tx.customer.findFirst({
    where: { id: customerId, isActive: true },
    select: { id: true },
  });
  if (!customer) throw new Error("Customer unavailable");
  const rows = await tx.crmSegment.findMany({
    where: { id: { in: segmentIds }, marketId },
  });
  const matched: string[] = [];
  for (const segment of rows) {
    const predicate = segmentQuery(marketId, segment.definition);
    const matches = await tx.$queryRaw<
      { id: string }[]
    >`SELECT c.id ${predicate} AND c.id=${customerId} LIMIT 1`;
    if (matches.length) matched.push(segment.id);
  }
  const profile = await tx.crmProfile.findUnique({
    where: { customerId_marketId: { customerId, marketId } },
  });
  const consents = {
    email: "UNKNOWN",
    sms: "UNKNOWN",
    whatsapp: "UNKNOWN",
    telegram: "UNKNOWN",
    push: "UNKNOWN",
  } as Record<
    "email" | "sms" | "whatsapp" | "telegram" | "push",
    "UNKNOWN" | "OPTED_IN" | "OPTED_OUT"
  >;
  for (const consent of await tx.marketingConsent.findMany({
    where: { customerId, marketId },
  })) {
    if (
      Object.hasOwn(consents, consent.channel) &&
      (consent.status === "OPTED_IN" || consent.status === "OPTED_OUT")
    )
      consents[consent.channel as keyof typeof consents] = consent.status;
  }
  return {
    id: customer.id,
    marketId,
    segmentIds: matched,
    tags: profile?.tags ?? [],
    consents,
    orderCount: await tx.order.count({
      where: {
        customerId,
        marketId,
        paidAt: { not: null },
        kind: "SALE",
        status: { not: "CANCELLED" },
      },
    }),
  };
}
