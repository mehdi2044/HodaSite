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
      variants: { select: { id: true } },
    },
  });
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
    const peers = products
      .filter(
        (other) =>
          other.id !== p.id &&
          other.categoryId === p.categoryId &&
          other.basePriceCurrency === p.basePriceCurrency &&
          other.basePriceAmount.gt(0),
      )
      .map((other) => new Exact(other.basePriceAmount.toString()))
      .sort((a, b) => a.cmp(b));
    if (peers.length >= 2) {
      const mid = Math.floor(peers.length / 2),
        median =
          peers.length % 2 ? peers[mid] : peers[mid - 1].add(peers[mid]).div(2);
      if (
        new Exact(p.basePriceAmount.toString())
          .sub(median)
          .abs()
          .div(median)
          .mul(100)
          .gt(deviationPercent)
      )
        await alert(tx, marketId, "PRICE_OUTLIER", p.id, day);
    }
  }
}
