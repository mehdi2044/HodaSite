import { promotionOrderAmounts } from "@/modules/promotions/order-amounts";
import { returnAmount, returnLineBudgets } from "@/modules/returns/validation";
import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import {
  configSchema,
  dayBounds,
  rewardAmount,
  maxPurchaseReward,
  type FittingConfig,
} from "./contracts";
export async function readConfig(tx: Prisma.TransactionClient) {
  const r = await tx.integration.findUnique({ where: { key: "fitting-room" } });
  const parsed = configSchema.safeParse(r?.config ?? {});
  const config = parsed.success ? parsed.data : configSchema.parse({});
  return { ...config, enabled: config.enabled && !!r?.isActive };
}
export async function lockWallet(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  await tx.fittingWallet.upsert({
    where: { customerId },
    create: { id: customerId, customerId },
    update: {},
  });
  await tx.$queryRaw`SELECT id FROM "FittingWallet" WHERE "customerId"=${customerId} FOR UPDATE`;
  return tx.fittingWallet.findUniqueOrThrow({ where: { customerId } });
}
export async function grantCoins(
  tx: Prisma.TransactionClient,
  customerId: string,
  sourceKey: string,
  reason: string,
  amount: string,
  extra: {
    expiresAt?: Date;
    orderId?: string;
    orderItemId?: string;
    ruleSnapshot?: Prisma.InputJsonValue;
  } = {},
) {
  if (
    await tx.fittingCoinGrant.findUnique({
      where: { customerId_sourceKey: { customerId, sourceKey } },
    })
  )
    return;
  const wallet = await tx.fittingWallet.findUniqueOrThrow({
      where: { customerId },
    }),
    value = new Decimal(amount),
    offset = Decimal.min(value, wallet.debt.toString());
  if (value.lte(0)) return;
  await tx.fittingCoinGrant.create({
    data: {
      customerId,
      sourceKey,
      reason,
      amount: value.toFixed(),
      balance: value.sub(offset).toFixed(),
      ...extra,
    },
  });
  if (offset.gt(0))
    await tx.fittingWallet.update({
      where: { customerId },
      data: { debt: new Decimal(wallet.debt.toString()).sub(offset).toFixed() },
    });
  await tx.fittingCoinEntry.create({
    data: {
      customerId,
      sourceKey: `grant:${sourceKey}`,
      amount: value.toFixed(),
      reason,
    },
  });
}
export async function allowances(
  tx: Prisma.TransactionClient,
  customerId: string,
  c: FittingConfig,
  now: Date,
) {
  await grantCoins(tx, customerId, "welcome", "WELCOME", c.welcomeCoins);
  const day = dayBounds(now, c.timezone);
  await grantCoins(
    tx,
    customerId,
    `daily:${day.key}`,
    "DAILY",
    new Decimal(c.costCoins).mul(c.dailyFreeUses).toFixed(),
    { expiresAt: day.end },
  );
  return day;
}
export async function usableGrants(
  tx: Prisma.TransactionClient,
  customerId: string,
  now: Date,
) {
  return tx.fittingCoinGrant.findMany({
    where: {
      customerId,
      balance: { gt: 0 },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [
      { expiresAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
}
/** Consume existing spendable lots to settle returned, already-used entitlements. Caller holds wallet lock. */
export async function settleDebt(
  tx: Prisma.TransactionClient,
  customerId: string,
  now = new Date(),
) {
  const wallet = await tx.fittingWallet.findUniqueOrThrow({
    where: { customerId },
  });
  let debt = new Decimal(wallet.debt.toString());
  if (debt.lte(0)) return;
  for (const grant of await usableGrants(tx, customerId, now)) {
    const take = Decimal.min(debt, grant.balance.toString());
    await tx.fittingCoinGrant.update({
      where: { id: grant.id },
      data: { balance: { decrement: take.toFixed() } },
    });
    debt = debt.sub(take);
    if (debt.eq(0)) break;
  }
  await tx.fittingWallet.update({
    where: { customerId },
    data: { debt: debt.toFixed() },
  });
}
export async function creditPaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, fees: true, promotionEvaluation: true },
  });
  if (!order.paidAt || order.kind !== "SALE") return;
  const config = await readConfig(tx);
  if (
    !config.enabled &&
    !order.items.some(
      (i) =>
        typeof (i.productSnapshot as Prisma.JsonObject).coinPackCoins ===
        "string",
    )
  )
    return;
  await lockWallet(tx, order.customerId);
  for (const item of order.items) {
    const snap = item.productSnapshot as Prisma.JsonObject;
    if (typeof snap.coinPackCoins === "string")
      await grantCoins(
        tx,
        order.customerId,
        `pack:${item.id}`,
        "PACK",
        new Decimal(snap.coinPackCoins).mul(item.quantity).toFixed(),
        { orderId, orderItemId: item.id },
      );
  }
  const c = config;
  if (!c.enabled) return;
  const reward = c.rewards.find((r) => r.marketId === order.marketId);
  if (!reward) return;
  const eligibleItems = order.items.filter(
    (item) =>
      typeof (item.productSnapshot as Prisma.JsonObject).coinPackCoins !==
      "string",
  );
  const budgets =
    promotionOrderAmounts(order)?.netItems ??
    returnLineBudgets(order.items, order.discountAmount.toString());
  const eligible = eligibleItems.reduce(
    (n, item) => n.add(item.lineTotalAmount.toString()),
    new Decimal(0),
  );
  // Immutable merchandise allocations exclude shipping and coin-pack discounts.
  const spend = eligibleItems.reduce(
    (n, item) => n.add(budgets.get(item.id)!.toString()),
    new Decimal(0),
  );

  await grantCoins(
    tx,
    order.customerId,
    `reward:${orderId}`,
    "PURCHASE",
    rewardAmount(spend.toFixed(), reward.spendAmount, reward.coins),
    {
      orderId,
      ruleSnapshot: {
        maxCoins: maxPurchaseReward,
        spendAmount: reward.spendAmount,
        coins: reward.coins,
        eligibleNetSpend: spend.toFixed(),
        eligibleGrossSpend: eligible.toFixed(),
        itemNetSpend: eligibleItems.map((item) => ({
          orderItemId: item.id,
          quantity: item.quantity,
          amount: budgets.get(item.id)!.toString(),
        })),
      },
    },
  );
}
/** Lock the source before financial settlement so descendant and direct returns share a lock order. */
export async function lockRewardSource(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  // All descendants settle against the source sale, serialized by its order lock.
  const source = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  let root = source;
  const seen = new Set([root.id]);
  while (root.kind === "EXCHANGE" && root.parentOrderId) {
    const parent = await tx.order.findUniqueOrThrow({
      where: { id: root.parentOrderId },
    });
    if (
      seen.has(parent.id) ||
      parent.customerId !== source.customerId ||
      parent.marketId !== source.marketId
    )
      return null;
    seen.add(parent.id);
    root = parent;
  }
  if (root.kind !== "SALE") return null;
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${root.id} FOR UPDATE`;
  return root.id;
}
/** Cumulative entitlement reversal, called under the existing order lock. */
export async function revokeReturnedCoins(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const rootId = await lockRewardSource(tx, orderId);
  if (!rootId) return;
  orderId = rootId;
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: true,
      fees: true,
      promotionEvaluation: true,
      returns: {
        where: {
          status: "RESOLVED",
          resolution: { in: ["REFUND", "STORE_CREDIT"] },
        },
        include: { items: true },
      },
    },
  });
  await lockWallet(tx, order.customerId);
  const grants = await tx.fittingCoinGrant.findMany({ where: { orderId } });
  if (!grants.length) return;
  const returned = new Map<string, number>();
  const returnedAmounts = new Map<string, Decimal>();
  for (const r of order.returns)
    for (const i of r.items) {
      returned.set(
        i.orderItemId,
        (returned.get(i.orderItemId) ?? 0) + i.quantity,
      );
      returnedAmounts.set(
        i.orderItemId,
        (returnedAmounts.get(i.orderItemId) ?? new Decimal(0)).add(
          i.refundAmount.toString(),
        ),
      );
    }
  // Replacement quantities map one-for-one to their original sale item, even
  // through repeated exchanges. Price differences are not new reward spend.
  const descendants = await tx.$queryRaw<
    { rootId: string; quantity: bigint }[]
  >`
    WITH RECURSIVE lineage AS (
      SELECT i.id, i.id AS "rootId", i."orderId", ARRAY[i.id]::text[] AS path
      FROM "OrderItem" i WHERE i."orderId"=${orderId}
      UNION ALL
      SELECT i.id, l."rootId", i."orderId", l.path || i.id
      FROM lineage l
      JOIN "OrderItem" i ON i."exchangeOfOrderItemId"=l.id
      JOIN "Order" o ON o.id=i."orderId"
      WHERE o.kind='EXCHANGE' AND o."parentOrderId"=l."orderId"
        AND o."customerId"=${order.customerId} AND o."marketId"=${order.marketId}
        AND NOT i.id = ANY(l.path)
    )
    SELECT l."rootId", SUM(r.quantity)::bigint AS quantity
    FROM lineage l
    JOIN "ReturnItem" r ON r."orderItemId"=l.id
    JOIN "ReturnRequest" rr ON rr.id=r."returnRequestId"
    WHERE l.id<>l."rootId" AND rr.status='RESOLVED'
      AND rr.resolution IN ('REFUND', 'STORE_CREDIT')
    GROUP BY l."rootId"
  `;
  const descendantQuantities = new Map(
    descendants.map((r) => [r.rootId, Number(r.quantity)]),
  );
  const directQuantities = new Map(returned);
  for (const [id, quantity] of descendantQuantities)
    returned.set(id, (returned.get(id) ?? 0) + quantity);
  const sourceReturnedAmount = (
    id: string,
    budget: Decimal.Value,
    sold: number,
  ) => {
    const direct = returnedAmounts.get(id) ?? new Decimal(0);
    const quantity = Math.min(
      descendantQuantities.get(id) ?? 0,
      sold - (directQuantities.get(id) ?? 0),
    );
    if (quantity <= 0) return direct;
    const allocated = Decimal.min(budget, direct);
    return allocated.add(
      returnAmount(
        budget,
        sold,
        directQuantities.get(id) ?? 0,
        allocated,
        quantity,
      ),
    );
  };
  for (const g of grants) {
    let target = new Decimal(0);
    if (g.orderItemId) {
      const item = order.items.find((i) => i.id === g.orderItemId);
      if (item)
        target = new Decimal(g.amount.toString())
          .mul(Math.min(item.quantity, returned.get(item.id) ?? 0))
          .div(item.quantity)
          .toDecimalPlaces(4);
    } else if (g.reason === "PURCHASE" && returned.size > 0) {
      const rule = g.ruleSnapshot as {
        spendAmount?: string;
        coins?: string;
        eligibleNetSpend?: string;
        eligibleGrossSpend?: string;
        itemNetSpend?: {
          orderItemId: string;
          quantity: number;
          amount: string;
        }[];
      } | null;
      const returnedSpend = order.items
        .filter(
          (i) =>
            typeof (i.productSnapshot as Prisma.JsonObject).coinPackCoins !==
            "string",
        )
        .reduce(
          (n, i) =>
            n.add(
              new Decimal(i.lineTotalAmount.toString())
                .mul(Math.min(i.quantity, returned.get(i.id) ?? 0))
                .div(i.quantity),
            ),
          new Decimal(0),
        );
      if (returnedSpend.gt(0)) {
        if (
          rule?.spendAmount &&
          rule.coins &&
          rule.eligibleNetSpend &&
          rule.eligibleGrossSpend &&
          new Decimal(rule.eligibleGrossSpend).gt(0)
        ) {
          const immutableBudgets = promotionOrderAmounts(order)?.netItems;
          // ReturnItem already preserves the four-decimal cumulative remainder.
          // Never recompute its allocation from remaining quantity.
          const net = rule.itemNetSpend
            ? rule.itemNetSpend.reduce(
                (sum, item) =>
                  sum.add(
                    Decimal.max(
                      0,
                      new Decimal(item.amount).sub(
                        sourceReturnedAmount(
                          item.orderItemId,
                          item.amount,
                          item.quantity,
                        ),
                      ),
                    ),
                  ),
                new Decimal(0),
              )
            : immutableBudgets
              ? order.items
                  .filter(
                    (item) =>
                      typeof (item.productSnapshot as Prisma.JsonObject)
                        .coinPackCoins !== "string",
                  )
                  .reduce(
                    (sum, item) =>
                      sum.add(
                        Decimal.max(
                          0,
                          new Decimal(
                            immutableBudgets.get(item.id)!.toString(),
                          ).sub(
                            sourceReturnedAmount(
                              item.id,
                              immutableBudgets.get(item.id)!.toString(),
                              item.quantity,
                            ),
                          ),
                        ),
                      ),
                    new Decimal(0),
                  )
              : Decimal.max(
                  0,
                  new Decimal(rule.eligibleNetSpend).sub(
                    order.items
                      .filter(
                        (item) =>
                          typeof (item.productSnapshot as Prisma.JsonObject)
                            .coinPackCoins !== "string",
                      )
                      .reduce(
                        (sum, item) =>
                          sum.add(
                            sourceReturnedAmount(
                              item.id,
                              new Decimal(rule.eligibleNetSpend!)
                                .mul(item.lineTotalAmount.toString())
                                .div(rule.eligibleGrossSpend!),
                              item.quantity,
                            ),
                          ),
                        new Decimal(0),
                      ),
                  ),
                );

          const remaining = new Decimal(
            rewardAmount(net.toFixed(), rule.spendAmount, rule.coins),
          );
          target = Decimal.max(
            0,
            new Decimal(g.amount.toString()).sub(remaining),
          );
        } else target = new Decimal(g.amount.toString());
      }
    }
    const delta = target.sub(g.revokedAmount.toString());
    if (delta.lte(0)) continue;
    const reclaim = Decimal.min(delta, g.balance.toString()),
      debt = delta.sub(reclaim);
    await tx.fittingCoinGrant.update({
      where: { id: g.id },
      data: {
        balance: new Decimal(g.balance.toString()).sub(reclaim).toFixed(),
        revokedAmount: target.toFixed(),
        ...(target.eq(g.amount.toString()) ? { revokedAt: new Date() } : {}),
      },
    });
    if (debt.gt(0))
      await tx.fittingWallet.update({
        where: { customerId: order.customerId },
        data: { debt: { increment: debt.toFixed() } },
      });
    await tx.fittingCoinEntry.create({
      data: {
        customerId: order.customerId,
        sourceKey: `revoke:${g.id}:${target.toFixed()}`,
        amount: delta.neg().toFixed(),
        reason: "RETURN_REVERSAL",
      },
    });
  }
  await settleDebt(tx, order.customerId);
}
