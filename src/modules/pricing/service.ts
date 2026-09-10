import Decimal from "decimal.js";
import { z } from "zod";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { Currency, RoundingRule } from "@/lib/money";
import { calculateDisplayPrice } from "./price";
import {
  exceedsJumpGuard,
  FrankfurterProvider,
  NavasanProvider,
  type FxProvider,
  type FxRate,
} from "./fx";
import { registerJobHandler } from "@/modules/jobs";

const fxConfigSchema = z.object({
  intlProvider: z.enum(["frankfurter", "manual"]).default("frankfurter"),
  irtProvider: z.enum(["navasan", "manual"]).default("navasan"),
  navasanField: z.enum(["usd_sell", "usd_buy"]).default("usd_sell"),
  refreshHours: z.coerce.number().int().min(1).max(168).default(6),
});

export async function getFxConfiguration() {
  const integration = await db.integration.findUnique({ where: { key: "fx" } });
  const parsed = fxConfigSchema.safeParse(integration?.config ?? {});
  return {
    ...fxConfigSchema.parse(parsed.success ? parsed.data : {}),
    isActive: integration?.isActive ?? true,
  };
}

const activeRateCached = unstable_cache(
  async (marketId: string, atIso: string) => {
    const at = new Date(atIso);
    const override = await db.fxOverride.findFirst({
      where: {
        marketId,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (override)
      return {
        rate: override.rate.toString(),
        source: "override",
        at: override.validFrom,
      };
    const quote = await db.fxQuote.findFirst({
      where: { marketId, status: "ACTIVE" },
      orderBy: { acceptedAt: "desc" },
    });
    return quote
      ? {
          rate: quote.rate.toString(),
          source: quote.provider,
          at: quote.acceptedAt ?? quote.fetchedAt,
        }
      : null;
  },
  ["active-fx-rate"],
  { revalidate: 900, tags: ["pricing"] },
);

export async function getActiveRate(
  market: { id: string; code: string },
  at = new Date(),
) {
  const bucket = new Date(at);
  bucket.setUTCSeconds(0, 0);
  const active = await activeRateCached(market.id, bucket.toISOString());
  if (!active) throw new Error(`No active FX rate for market ${market.code}`);
  return active;
}

const marketPriceCached = unstable_cache(
  async (
    marketId: string,
    productId: string,
    variantId: string | null,
    atIso: string,
  ) => {
    const at = new Date(atIso);
    const validity = {
      marketId,
      isActive: true,
      validFrom: { lte: at },
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: at } }] }],
    };
    if (variantId) {
      const variantPrice = await db.marketPrice.findFirst({
        where: { ...validity, variantId },
        orderBy: { validFrom: "desc" },
      });
      if (variantPrice) return variantPrice;
    }
    return db.marketPrice.findFirst({
      where: { ...validity, productId },
      orderBy: { validFrom: "desc" },
    });
  },
  ["market-price"],
  { revalidate: 900, tags: ["pricing"] },
);

export async function getDisplayPrice(
  product: {
    id: string;
    basePriceAmount: { toString(): string };
    compareAtPriceAmount: { toString(): string } | null;
  },
  variant: {
    id: string;
    priceOverrideUsd: { toString(): string } | null;
  } | null,
  market: {
    id: string;
    code: string;
    currency: string;
    markupPercent: { toString(): string };
    roundingRule: unknown;
  },
  at = new Date(),
) {
  const priceBucket = new Date(at);
  priceBucket.setUTCMinutes(
    Math.floor(priceBucket.getUTCMinutes() / 15) * 15,
    0,
    0,
  );
  const manual = await marketPriceCached(
    market.id,
    product.id,
    variant?.id ?? null,
    priceBucket.toISOString(),
  );
  const active = await getActiveRate(market, at);
  const currency = (
    ["USD", "TRY", "CAD", "IRT"].includes(market.currency)
      ? market.currency
      : "USD"
  ) as Currency;
  return calculateDisplayPrice({
    baseAmount:
      variant?.priceOverrideUsd?.toString() ??
      product.basePriceAmount.toString(),
    baseCurrency: "USD",
    marketCurrency: currency,
    activeRate: active.rate,
    markupPercent: market.markupPercent.toString(),
    roundingRule: market.roundingRule as RoundingRule,
    manualAmount: manual?.amount.toString(),
    compareAtBaseAmount: product.compareAtPriceAmount?.toString(),
    manualCompareAtAmount: manual?.compareAtAmount?.toString(),
  });
}

export async function getBasePriceFilterAmount(
  marketAmount: string,
  market: {
    id: string;
    code: string;
    markupPercent: { toString(): string };
  },
) {
  const active = await getActiveRate(market);
  return new Decimal(marketAmount).div(
    new Decimal(active.rate).mul(
      new Decimal(1).plus(
        new Decimal(market.markupPercent.toString()).div(100),
      ),
    ),
  );
}

async function activateQuote(
  id: string,
  marketId: string,
  acceptedById?: string,
) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "Market" WHERE id = ${marketId} FOR UPDATE
    `;
    const previous = await tx.fxQuote.findFirst({
      where: { marketId, status: "ACTIVE" },
    });
    await tx.fxQuote.updateMany({
      where: { marketId, status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });
    const active = await tx.fxQuote.update({
      where: { id },
      data: { status: "ACTIVE", acceptedAt: new Date(), acceptedById },
    });
    await tx.auditLog.create({
      data: {
        userId: acceptedById,
        action: acceptedById ? "fx.accept" : "fx.auto_accept",
        entityType: "FxQuote",
        entityId: id,
        before: previous
          ? { id: previous.id, rate: previous.rate.toString() }
          : undefined,
        after: { rate: active.rate.toString(), provider: active.provider },
      },
    });
  });
  revalidateTag("pricing");
}

export async function acceptFxQuote(id: string, acceptedById?: string) {
  const quote = await db.fxQuote.findUniqueOrThrow({ where: { id } });
  await activateQuote(quote.id, quote.marketId, acceptedById);
}

export async function persistFxRate(rate: FxRate) {
  const market = await db.market.findFirstOrThrow({
    where: { currency: rate.quote },
  });
  const active = await db.fxQuote.findFirst({
    where: { marketId: market.id, status: "ACTIVE" },
    orderBy: { acceptedAt: "desc" },
  });
  const guarded = active
    ? exceedsJumpGuard(
        active.rate.toString(),
        rate.rate,
        market.fxMaxJumpPercent.toString(),
      )
    : false;
  const quote = await db.fxQuote.create({
    data: {
      marketId: market.id,
      baseCurrency: rate.base,
      quoteCurrency: rate.quote,
      rate: rate.rate,
      provider: rate.provider,
      sourceField: rate.provider === "navasan" ? rate.sourceField : null,
      fetchedAt: rate.fetchedAt,
      jumpPercent: active
        ? new Decimal(rate.rate)
            .sub(active.rate)
            .abs()
            .div(active.rate)
            .mul(100)
        : null,
    },
  });
  if (market.fxMode === "AUTO_ACCEPT" && !guarded)
    await activateQuote(quote.id, market.id);
  if (guarded)
    await db.systemAlert.create({
      data: {
        severity: "WARNING",
        code: `FX_JUMP_${market.code}`,
        message: `Suggested ${rate.quote} rate exceeded the ${market.fxMaxJumpPercent.toString()}% guard`,
      },
    });
  return quote;
}

export async function refreshFxRates() {
  const config = await getFxConfiguration();
  if (!config.isActive) return 0;
  const providers: FxProvider[] = [];
  if (config.intlProvider === "frankfurter")
    providers.push(new FrankfurterProvider());
  if (config.irtProvider === "navasan") {
    if (process.env.NAVASAN_API_KEY)
      providers.push(
        new NavasanProvider(process.env.NAVASAN_API_KEY, config.navasanField),
      );
    else
      await db.systemAlert.create({
        data: {
          severity: "WARNING",
          code: "FX_PROVIDER_NAVASAN",
          message: "Navasan is active but NAVASAN_API_KEY is not configured",
        },
      });
  }
  let stored = 0;
  for (const provider of providers) {
    try {
      for (const rate of await provider.fetchRates()) {
        await persistFxRate(rate);
        stored += 1;
      }
    } catch (error) {
      await db.systemAlert.create({
        data: {
          severity: "WARNING",
          code: `FX_PROVIDER_${provider.key.toUpperCase()}`,
          message:
            error instanceof Error ? error.message : "FX provider failed",
        },
      });
    }
  }
  return stored;
}

export const FX_REFRESH_JOB = "fx-refresh";

export function registerPricingJobHandlers() {
  registerJobHandler(FX_REFRESH_JOB, async () => {
    await refreshFxRates();
    const config = await getFxConfiguration();
    await db.job.create({
      data: {
        type: FX_REFRESH_JOB,
        runAt: new Date(Date.now() + config.refreshHours * 60 * 60 * 1000),
      },
    });
  });
}

export function isRateStale(
  rateAt: Date | null | undefined,
  staleHours: number,
  now = new Date(),
): boolean {
  if (!rateAt) return true;
  return now.getTime() - rateAt.getTime() > staleHours * 60 * 60 * 1000;
}

export async function ensureFxRefreshScheduled() {
  const exists = await db.job.findFirst({
    where: { type: FX_REFRESH_JOB, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (!exists) await db.job.create({ data: { type: FX_REFRESH_JOB } });
}
