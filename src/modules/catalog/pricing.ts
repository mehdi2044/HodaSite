import Decimal from "decimal.js";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

const SAFE_PHASE02_RATES: Record<string, string> = {
  IR: "60000",
  TR: "35",
  CA: "1.40",
};

type Phase02RateConfig = Record<string, string>;

/**
 * Temporary Phase 02 adapter behind the pricing boundary. Phase 03 replaces
 * the source with active FxQuote/FxOverride without changing catalog callers.
 * Values live in Integration.config; constants are fail-safe demo defaults.
 */
const getPhase02Rates = unstable_cache(
  async () => {
    const integration = await db.integration.findUnique({
      where: { key: "pricing.phase02-test-rates" },
      select: { config: true },
    });
    return (integration?.config ?? {}) as Phase02RateConfig;
  },
  ["phase02-catalog-rates"],
  { tags: ["pricing"] },
);

export async function getPhase02CatalogRate(marketCode: string) {
  const config = await getPhase02Rates();
  const candidate = config[marketCode] ?? SAFE_PHASE02_RATES[marketCode] ?? "1";
  const rate = new Decimal(candidate);
  return rate.isPositive() ? rate : new Decimal(1);
}

export async function catalogDisplayAmount(
  basePriceUsd: Decimal.Value,
  market: { code: string; markupPercent: Decimal.Value },
) {
  const rate = await getPhase02CatalogRate(market.code);
  return new Decimal(basePriceUsd)
    .times(rate)
    .times(
      new Decimal(1).plus(new Decimal(market.markupPercent).dividedBy(100)),
    );
}

export async function catalogBaseAmount(
  marketAmount: Decimal.Value,
  market: { code: string; markupPercent: Decimal.Value },
) {
  const rate = await getPhase02CatalogRate(market.code);
  return new Decimal(marketAmount).dividedBy(
    rate.times(
      new Decimal(1).plus(new Decimal(market.markupPercent).dividedBy(100)),
    ),
  );
}
