import { calculateDisplayPrice } from "@/modules/pricing/price";
import type { Currency, RoundingRule } from "@/lib/money";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Exact } from "./operations-input";
type Tx = Prisma.TransactionClient;
async function alert(
  tx: Tx,
  marketId: string,
  kind: string,
  productId: string,
  source: string,
) {
  const code = `FINANCE:${marketId}:${kind}:${productId}`;
  const id = `finance-${createHash("sha256").update(`${code}:${source}`).digest("hex").slice(0, 40)}`;
  await tx.systemAlert.upsert({
    where: { id },
    create: {
      id,
      code,
      severity: "WARNING",
      message: "Finance review required",
    },
    update: {},
  });
}
/** A warning records the condition; it never vetoes a sale. */
export async function raiseOrderAlerts(
  tx: Tx,
  orderId: string,
  marketId: string,
  threshold: string,
) {
  const rows = await tx.financeAttribution.groupBy({
    by: ["productId"],
    where: { orderId },
    _sum: { revenueTry: true, costTry: true },
  });
  for (const r of rows) {
    const revenue = new Exact(r._sum.revenueTry?.toString() ?? "0"),
      cost = new Exact(r._sum.costTry?.toString() ?? "0");
    if (cost.gt(revenue))
      await alert(tx, marketId, "BELOW_COST", r.productId, orderId);
    else if (
      revenue.gt(0) &&
      revenue.sub(cost).div(revenue).mul(100).lt(threshold)
    )
      await alert(tx, marketId, "LOW_MARGIN", r.productId, orderId);
  }
}
export async function scanStockAlerts(
  tx: Tx,
  marketId: string,
  slowDays: number,
  deviationPercent: string,
) {
  const products = await tx.product.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      OR: [{ marketIds: { isEmpty: true } }, { marketIds: { has: marketId } }],
    },
    select: {
      id: true,
      categoryId: true,
      basePriceAmount: true,
      basePriceCurrency: true,
      variants: { select: { id: true, priceOverrideUsd: true } },
    },
  });
  const at = new Date(),
    market = await tx.market.findUniqueOrThrow({ where: { id: marketId } });
  const override = await tx.fxOverride.findFirst({
    where: {
      marketId,
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gt: at } }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const quote = override
    ? null
    : await tx.fxQuote.findFirst({
        where: { marketId, status: "ACTIVE" },
        orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
      });
  const rate = override?.rate.toString() ?? quote?.rate.toString();
  const manual = await tx.marketPrice.findMany({
    where: {
      marketId,
      isActive: true,
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gt: at } }],
    },
    orderBy: { validFrom: "desc" },
  });
  if (!rate)
    await alert(
      tx,
      marketId,
      "PRICE_UNAVAILABLE",
      "config",
      at.toISOString().slice(0, 10),
    );
  const prices: {
    productId: string;
    categoryId: string;
    amount: InstanceType<typeof Exact>;
  }[] = [];
  if (rate && ["TRY", "USD", "CAD", "IRT"].includes(market.currency))
    for (const p of products)
      for (const v of p.variants) {
        const chosen =
          manual.find((m) => m.variantId === v.id) ??
          manual.find((m) => m.productId === p.id && !m.variantId);
        const value = calculateDisplayPrice({
          baseAmount:
            v.priceOverrideUsd?.toString() ?? p.basePriceAmount.toString(),
          baseCurrency: "USD",
          marketCurrency: market.currency as Currency,
          activeRate: rate,
          markupPercent: market.markupPercent.toString(),
          roundingRule: market.roundingRule as RoundingRule,
          manualAmount: chosen?.amount.toString(),
        });
        prices.push({
          productId: p.id,
          categoryId: p.categoryId,
          amount: new Exact(value.amount),
        });
      }
  const cutoff = new Date(Date.now() - slowDays * 86400000),
    day = new Date().toISOString().slice(0, 10);
  for (const p of products) {
    const variantIds = p.variants.map((v) => v.id);
    const [oldStock, sale] = await Promise.all([
      tx.lot.findFirst({
        where: {
          variantId: { in: variantIds },
          qtyRemaining: { gt: 0 },
          receivedAt: { lt: cutoff },
        },
        select: { id: true },
      }),
      tx.stockMovement.findFirst({
        where: {
          variantId: { in: variantIds },
          type: "OUT",
          createdAt: { gte: cutoff },
        },
        select: { id: true },
      }),
    ]);
    if (oldStock && !sale) await alert(tx, marketId, "SLOW_STOCK", p.id, day);
    const peers = prices
      .filter(
        (price) =>
          price.productId !== p.id &&
          price.categoryId === p.categoryId &&
          price.amount.gt(0),
      )
      .map((price) => price.amount)
      .sort((a, b) => a.cmp(b));
    if (peers.length >= 2) {
      const mid = Math.floor(peers.length / 2),
        median =
          peers.length % 2 ? peers[mid] : peers[mid - 1].add(peers[mid]).div(2);
      if (
        prices.some(
          (price) =>
            price.productId === p.id &&
            price.amount
              .sub(median)
              .abs()
              .div(median)
              .mul(100)
              .gt(deviationPercent),
        )
      )
        await alert(tx, marketId, "PRICE_OUTLIER", p.id, day);
    }
  }
}
