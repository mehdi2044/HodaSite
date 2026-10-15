import { db } from "@/lib/db";
import {
  promotionRevisionSchema,
  PromotionDecimal,
} from "@/modules/promotions/contracts";
import type { Prisma } from "@prisma/client";
export type PublicCampaign = {
  id: string;
  revision: number;
  state: "UPCOMING" | "ACTIVE" | "ENDED" | "EXHAUSTED";
  startsAt: string;
  endsAt: string | null;
  now: string;
  conditional: boolean;
};
/** Display metadata only. The existing promotion engine remains the quote authority. */
export async function resolvePublicCampaign(
  programId: string,
  marketId: string,
  currency: string,
  locale: "fa" | "tr" | "en",
  client: Prisma.TransactionClient = db,
): Promise<PublicCampaign | null> {
  const row = await client.promotionProgram.findFirst({
    where: { id: programId, marketId },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const parsed = promotionRevisionSchema.safeParse(row?.revisions[0]?.config);
  if (!row || !parsed.success) return null;
  const config = parsed.data;
  if (
    config.id !== row.id ||
    config.revision !== row.version ||
    config.marketId !== marketId ||
    config.currency !== currency ||
    row.currency !== currency ||
    !config.enabled ||
    !["ACTIVE", "SCHEDULED"].includes(config.status) ||
    config.definition.conditions.some(
      (condition) => condition.field === "locale" && condition.value !== locale,
    )
  )
    return null;
  const [clock] = await client.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  const now = clock.now;
  let state: PublicCampaign["state"] =
    now < new Date(config.startsAt)
      ? "UPCOMING"
      : config.endsAt && now >= new Date(config.endsAt)
        ? "ENDED"
        : "ACTIVE";
  if (
    state === "ACTIVE" &&
    (config.totalUsageCap !== null || config.budget !== null)
  ) {
    const totals = await client.promotionRedemption.aggregate({
      where: { programId, evaluation: { release: null } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    if (
      (config.totalUsageCap !== null &&
        totals._count._all >= config.totalUsageCap) ||
      (config.budget !== null &&
        new PromotionDecimal(totals._sum.amount?.toFixed(4) ?? "0").gte(
          config.budget,
        ))
    )
      state = "EXHAUSTED";
  }
  return {
    id: row.id,
    revision: row.version,
    state,
    startsAt: config.startsAt,
    endsAt: config.endsAt,
    now: now.toISOString(),
    conditional:
      config.couponRequired ||
      config.perCustomerCap !== null ||
      config.definition.conditions.some(
        (condition) =>
          condition.field !== "market" && condition.field !== "locale",
      ),
  };
}
