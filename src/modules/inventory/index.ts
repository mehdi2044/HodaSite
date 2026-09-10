import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getActiveRate } from "@/modules/pricing";

export type CostLot = Readonly<{
  id: string;
  qtyRemaining: number;
  unitCostAmount: string;
  unitCostCurrency: string;
  receivedAt: Date;
}>;

export function fifoCogs(lots: readonly CostLot[], quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new Error("Quantity must be a positive integer");
  let needed = quantity;
  const allocations: Array<{
    lotId: string;
    quantity: number;
    amount: string;
  }> = [];
  let total: Decimal | null = null;
  let currency: string | null = null;
  for (const lot of [...lots].sort(
    (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
  )) {
    if (needed === 0) break;
    if (currency && currency !== lot.unitCostCurrency)
      throw new Error("FIFO lots must use one snapshot currency");
    currency = lot.unitCostCurrency;
    const take = Math.min(needed, lot.qtyRemaining);
    if (take <= 0) continue;
    const amount = new Decimal(lot.unitCostAmount).mul(take);
    total = (total ?? new Decimal(0)).add(amount);
    allocations.push({
      lotId: lot.id,
      quantity: take,
      amount: amount.toFixed(),
    });
    needed -= take;
  }
  if (needed > 0) throw new Error("Insufficient stock for FIFO COGS");
  return Object.freeze({
    quantity,
    currency,
    amount: total?.toFixed() ?? "0",
    allocations: Object.freeze(allocations),
  });
}

export async function cogsForSale(
  variantId: string,
  quantity: number,
  currency: "TRY" | "USD" = "TRY",
) {
  const lots = await db.lot.findMany({
    where: { variantId, qtyRemaining: { gt: 0 } },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
  });
  return fifoCogs(
    lots.map((lot) => ({
      id: lot.id,
      qtyRemaining: lot.qtyRemaining,
      unitCostAmount:
        currency === "TRY"
          ? lot.unitCostAmountTry.toString()
          : lot.unitCostAmountUsd.toString(),
      unitCostCurrency: currency,
      receivedAt: lot.receivedAt,
    })),
    quantity,
  );
}

export type ReceiveStockInput = {
  warehouseId: string;
  variantId: string;
  quantity: number;
  unitCostAmount: string;
  unitCostCurrency: string;
  unitCostAmountTry: string;
  unitCostAmountUsd: string;
  fxRateSnapshot: Prisma.InputJsonValue;
  receivedAt: Date;
  createdBy?: string;
};

export async function snapshotPurchaseCost(
  amount: string,
  currency: "USD" | "TRY" | "CAD" | "IRT",
  at = new Date(),
) {
  const markets = await db.market.findMany({
    where: {
      currency: { in: currency === "USD" ? ["TRY"] : ["TRY", currency] },
    },
    select: { id: true, code: true, currency: true },
  });
  const tryMarket = markets.find((market) => market.currency === "TRY");
  if (!tryMarket) throw new Error("TRY market is required for cost snapshots");
  const tryRate = await getActiveRate(tryMarket, at);
  const original = new Decimal(amount);
  if (!original.gt(0)) throw new Error("Unit cost must be positive");
  let usd: Decimal;
  let originalRate = "1";
  if (currency === "USD") usd = original;
  else if (currency === "TRY") {
    originalRate = tryRate.rate;
    usd = original.div(tryRate.rate);
  } else {
    const originalMarket = markets.find(
      (market) => market.currency === currency,
    );
    if (!originalMarket)
      throw new Error(`Market rate is required for ${currency}`);
    const rate = await getActiveRate(originalMarket, at);
    originalRate = rate.rate;
    usd = original.div(rate.rate);
  }
  return Object.freeze({
    unitCostAmountTry: usd.mul(tryRate.rate).toDecimalPlaces(4).toFixed(),
    unitCostAmountUsd: usd.toDecimalPlaces(4).toFixed(),
    fxRateSnapshot: {
      base: "USD",
      originalCurrency: currency,
      originalPerUsd: originalRate,
      tryPerUsd: tryRate.rate,
      capturedAt: at.toISOString(),
    } satisfies Prisma.InputJsonObject,
  });
}

export async function receiveStock(input: ReceiveStockInput) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    throw new Error("Quantity must be a positive integer");
  return db.$transaction(async (tx) => {
    const stock = await tx.stockItem.upsert({
      where: {
        warehouseId_variantId: {
          warehouseId: input.warehouseId,
          variantId: input.variantId,
        },
      },
      update: { onHand: { increment: input.quantity } },
      create: {
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        onHand: input.quantity,
      },
    });
    const lot = await tx.lot.create({
      data: {
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        qtyReceived: input.quantity,
        qtyRemaining: input.quantity,
        unitCostAmount: input.unitCostAmount,
        unitCostCurrency: input.unitCostCurrency,
        unitCostAmountTry: input.unitCostAmountTry,
        unitCostAmountUsd: input.unitCostAmountUsd,
        fxRateSnapshot: input.fxRateSnapshot,
        receivedAt: input.receivedAt,
      },
    });
    const movement = await tx.stockMovement.create({
      data: {
        stockItemId: stock.id,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        lotId: lot.id,
        type: "IN",
        quantity: input.quantity,
        createdBy: input.createdBy,
      },
    });
    if (input.createdBy)
      await tx.auditLog.create({
        data: {
          userId: input.createdBy,
          action: "inventory.receive",
          entityType: "Lot",
          entityId: lot.id,
          after: {
            quantity: input.quantity,
            unitCostAmount: input.unitCostAmount,
            unitCostCurrency: input.unitCostCurrency,
          },
        },
      });
    return { stock, lot, movement };
  });
}

export type ReservationRequest = Readonly<{
  warehouseId: string;
  variantId: string;
  quantity: number;
  kind: "HOLD" | "VERIFICATION";
  expiresAt?: Date;
  referenceId?: string;
}>;

export async function reserveStock(requests: readonly ReservationRequest[]) {
  const ordered = [...requests].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  );
  if (ordered.some((r) => !Number.isInteger(r.quantity) || r.quantity <= 0))
    throw new Error("Reservation quantities must be positive integers");
  if (ordered.some((r) => r.kind === "HOLD" && !r.expiresAt))
    throw new Error("HOLD reservations require an expiry time");
  if (ordered.some((r) => r.kind === "VERIFICATION" && r.expiresAt))
    throw new Error("VERIFICATION reservations must not expire");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const reservations = [];
          for (const request of ordered) {
            const rows = await tx.$queryRaw<
              Array<{ id: string; onHand: number; reserved: number }>
            >`
              SELECT id, "onHand", reserved FROM "StockItem"
              WHERE "warehouseId" = ${request.warehouseId} AND "variantId" = ${request.variantId}
              FOR UPDATE
            `;
            const stock = rows[0];
            if (!stock || stock.onHand - stock.reserved < request.quantity)
              throw new Error(
                `Insufficient stock for variant ${request.variantId}`,
              );
            await tx.stockItem.update({
              where: { id: stock.id },
              data: { reserved: { increment: request.quantity } },
            });
            reservations.push(
              await tx.reservation.create({
                data: {
                  stockItemId: stock.id,
                  warehouseId: request.warehouseId,
                  variantId: request.variantId,
                  quantity: request.quantity,
                  kind: request.kind,
                  expiresAt: request.kind === "HOLD" ? request.expiresAt : null,
                  referenceId: request.referenceId,
                },
              }),
            );
          }
          return reservations;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!retryable || attempt === 7) throw error;
    }
  }
  throw new Error("Inventory reservation retry limit exceeded");
}

export async function expireReservations(now = new Date()): Promise<number> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; stockItemId: string; quantity: number }>
    >`
      SELECT id, "stockItemId", quantity FROM "Reservation"
      WHERE status = 'ACTIVE' AND kind = 'HOLD' AND "expiresAt" <= ${now}
      ORDER BY "variantId", id
      FOR UPDATE SKIP LOCKED
    `;
    for (const row of rows) {
      await tx.stockItem.update({
        where: { id: row.stockItemId },
        data: { reserved: { decrement: row.quantity } },
      });
      await tx.reservation.update({
        where: { id: row.id },
        data: { status: "EXPIRED", releasedAt: now },
      });
    }
    return rows.length;
  });
}

export async function availableForVariant(variantId: string) {
  const totals = await db.stockItem.aggregate({
    where: { variantId },
    _sum: { onHand: true, reserved: true },
  });
  return (totals._sum.onHand ?? 0) - (totals._sum.reserved ?? 0);
}
