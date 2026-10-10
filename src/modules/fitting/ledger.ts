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
// Aggregate liabilities can exceed a single numeric(18,4) row. Keep ample
// precision for sums without changing the precision of individual coin entries.
const DebtDecimal = Decimal.clone({ precision: 100 });
export async function walletDebt(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const [wallet, overflow] = await Promise.all([
    tx.fittingWallet.findUniqueOrThrow({ where: { customerId } }),
    tx.fittingCoinDebtOverflow.aggregate({
      where: { customerId, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
  ]);
  return new DebtDecimal(wallet.debt.toString()).add(
    overflow._sum.balance?.toString() ?? "0",
  );
}
/** Caller holds the wallet lock. Every stored liability tranche stays in range. */
async function addCoinDebt(
  tx: Prisma.TransactionClient,
  customerId: string,
  sourceKey: string,
  amount: Decimal,
) {
  const wallet = await tx.fittingWallet.findUniqueOrThrow({
    where: { customerId },
  });
  const first = Decimal.min(
    amount,
    new Decimal(maxPurchaseReward).sub(wallet.debt.toString()),
  );
  if (first.gt(0))
    await tx.fittingWallet.update({
      where: { customerId },
      data: { debt: { increment: first.toFixed() } },
    });
  const overflow = amount.sub(first);
  if (overflow.gt(0))
    await tx.fittingCoinDebtOverflow.create({
      data: {
        customerId,
        sourceKey,
        amount: overflow.toFixed(),
        balance: overflow.toFixed(),
      },
    });
}
function debtPayment(
  amount: Decimal.Value,
  base: Decimal.Value,
  lots: { id: string; balance: { toString(): string } }[],
) {
  const value = new DebtDecimal(amount);
  const first = Decimal.min(value, base);
  let remaining = value.sub(first);
  const updates: { id: string; balance: string }[] = [];
  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, lot.balance.toString());
    if (take.gt(0))
      updates.push({
        id: lot.id,
        balance: new Decimal(lot.balance.toString()).sub(take).toFixed(),
      });
    remaining = remaining.sub(take);
  }
  return {
    paid: value.sub(remaining),
    first,
    base: new Decimal(base).sub(first).toFixed(),
    updates,
  };
}
async function persistDebtPayments(
  tx: Prisma.TransactionClient,
  wallets: { customerId: string; balance: string }[],
  lots: { id: string; balance: string }[],
) {
  // Bound statement parameters while keeping the complete audience atomic.
  for (let offset = 0; offset < wallets.length; offset += 400) {
    const rows = wallets.slice(offset, offset + 400);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "FittingWallet" w SET debt=v.balance::numeric, "updatedAt"=CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(rows.map((r) => Prisma.sql`(${r.customerId}, ${r.balance})`))})
      AS v(id, balance) WHERE w."customerId"=v.id
    `);
  }
  for (let offset = 0; offset < lots.length; offset += 400) {
    const rows = lots.slice(offset, offset + 400);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "FittingCoinDebtOverflow" d SET balance=v.balance::numeric, "updatedAt"=CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(rows.map((r) => Prisma.sql`(${r.id}, ${r.balance})`))})
      AS v(id, balance) WHERE d.id=v.id
    `);
  }
}
/** Repay all liability tranches; caller holds wallet lock. */
export async function payCoinDebt(
  tx: Prisma.TransactionClient,
  customerId: string,
  amount: Decimal.Value,
) {
  const wallet = await tx.fittingWallet.findUniqueOrThrow({
    where: { customerId },
  });
  const lots = new DebtDecimal(amount).gt(wallet.debt.toString())
    ? await tx.fittingCoinDebtOverflow.findMany({
        where: { customerId, balance: { gt: 0 } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [];
  const plan = debtPayment(amount, wallet.debt.toString(), lots);
  await persistDebtPayments(
    tx,
    plan.first.gt(0) ? [{ customerId, balance: plan.base }] : [],
    plan.updates,
  );
  return plan.paid;
}
/** Batched manual audience: ordered wallet locks, exact debt repayment and immutable entries. */
export async function grantCoinsBatch(
  tx: Prisma.TransactionClient,
  customerIds: string[],
  sourceKey: string,
  reason: string,
  amount: string,
  extra: { expiresAt?: Date } = {},
) {
  const ids = [...new Set(customerIds)].sort(),
    value = new Decimal(amount);
  if (!ids.length || value.lte(0)) return;
  await tx.fittingWallet.createMany({
    data: ids.map((customerId) => ({ id: customerId, customerId })),
    skipDuplicates: true,
  });
  const wallets = await tx.$queryRaw<
    { customerId: string; debt: Prisma.Decimal }[]
  >(Prisma.sql`
    SELECT "customerId", debt FROM "FittingWallet"
    WHERE "customerId" IN (${Prisma.join(ids)}) ORDER BY "customerId" FOR UPDATE
  `);
  const existing = new Set(
    (
      await tx.fittingCoinGrant.findMany({
        where: { customerId: { in: ids }, sourceKey },
        select: { customerId: true },
      })
    ).map((g) => g.customerId),
  );
  const eligible = wallets.filter((w) => !existing.has(w.customerId));
  const overflowIds = eligible
    .filter((w) => value.gt(w.debt.toString()))
    .map((w) => w.customerId);
  const lots = overflowIds.length
    ? await tx.fittingCoinDebtOverflow.findMany({
        where: { customerId: { in: overflowIds }, balance: { gt: 0 } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, customerId: true, balance: true },
      })
    : [];
  const grouped = new Map<string, typeof lots>();
  for (const lot of lots) {
    if (!grouped.has(lot.customerId)) grouped.set(lot.customerId, []);
    grouped.get(lot.customerId)!.push(lot);
  }
  const changes: { customerId: string; balance: string }[] = [],
    lotChanges: { id: string; balance: string }[] = [],
    grants: Prisma.FittingCoinGrantCreateManyInput[] = [],
    entries: Prisma.FittingCoinEntryCreateManyInput[] = [];
  for (const wallet of eligible) {
    const plan = debtPayment(
      value,
      wallet.debt.toString(),
      grouped.get(wallet.customerId) ?? [],
    );
    if (plan.first.gt(0))
      changes.push({ customerId: wallet.customerId, balance: plan.base });
    for (const update of plan.updates) lotChanges.push(update);
    grants.push({
      customerId: wallet.customerId,
      sourceKey,
      reason,
      amount: value.toFixed(),
      balance: value.sub(plan.paid).toFixed(),
      ...extra,
    });
    entries.push({
      customerId: wallet.customerId,
      sourceKey: `grant:${sourceKey}`,
      reason,
      amount: value.toFixed(),
    });
  }
  await persistDebtPayments(tx, changes, lotChanges);
  if (grants.length) {
    await tx.fittingCoinGrant.createMany({ data: grants });
    await tx.fittingCoinEntry.createMany({ data: entries });
  }
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
  const value = new Decimal(amount);
  if (value.lte(0)) return;
  const offset = await payCoinDebt(tx, customerId, value);
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
  const original = await walletDebt(tx, customerId);
  let debt = original;
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
  await payCoinDebt(tx, customerId, original.sub(debt));
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
      await addCoinDebt(
        tx,
        order.customerId,
        `revoke:${g.id}:${target.toFixed()}`,
        debt,
      );
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
