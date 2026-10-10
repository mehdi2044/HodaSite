import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { configSchema, dayBounds, type FittingConfig } from "./contracts";
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
    include: { items: true },
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
  const eligible = order.items
    .filter(
      (item) =>
        typeof (item.productSnapshot as Prisma.JsonObject).coinPackCoins !==
        "string",
    )
    .reduce(
      (n, item) => n.add(item.lineTotalAmount.toString()),
      new Decimal(0),
    );
  // Exclude fees and pack purchases; deduct all merchandise discount conservatively.
  const spend = Decimal.max(0, eligible.sub(order.discountAmount.toString()));
  await grantCoins(
    tx,
    order.customerId,
    `reward:${orderId}`,
    "PURCHASE",
    rewardAmountSafe(spend.toFixed(), reward.spendAmount, reward.coins),
    {
      orderId,
      ruleSnapshot: {
        spendAmount: reward.spendAmount,
        coins: reward.coins,
        eligibleNetSpend: spend.toFixed(),
        eligibleGrossSpend: eligible.toFixed(),
      },
    },
  );
}
function rewardAmountSafe(spend: string, threshold: string, coins: string) {
  return new Decimal(spend)
    .div(threshold)
    .floor()
    .mul(coins)
    .toDecimalPlaces(4)
    .toFixed();
}
/** Cumulative entitlement reversal, called under the existing order lock. */
export async function revokeReturnedCoins(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: true,
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
  for (const r of order.returns)
    for (const i of r.items)
      returned.set(
        i.orderItemId,
        (returned.get(i.orderItemId) ?? 0) + i.quantity,
      );
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
          const net = new Decimal(rule.eligibleNetSpend)
            .mul(
              Decimal.max(
                0,
                new Decimal(rule.eligibleGrossSpend).sub(returnedSpend),
              ),
            )
            .div(rule.eligibleGrossSpend);
          const remaining = new Decimal(
            rewardAmountSafe(net.toFixed(), rule.spendAmount, rule.coins),
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
