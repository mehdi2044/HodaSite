import { Prisma, type Lot, type StockMovement } from "@prisma/client";
import { Exact } from "./operations-input";
import { allocatedMovementCost, costSnapshot } from "./cost-snapshot";
export async function movementCost(
  tx: Prisma.TransactionClient,
  m: StockMovement,
  lot: Lot,
) {
  const valuation = await tx.stockValuation.findUnique({
    where: { movementId: m.id },
  });
  if (valuation) return valuation.amount.toFixed(4);
  const item = await tx.purchaseOrderItem.findUnique({
    where: { lotId: lot.id },
    select: { landedTotal: true },
  });
  const total =
    item?.landedTotal.toString() ??
    new Exact(lot.unitCostAmount.toString()).mul(lot.qtyReceived).toFixed(4);
  const prior = await tx.stockMovement.aggregate({
    where: {
      lotId: lot.id,
      type: { in: ["OUT", "RETURN_RESTOCK", "WRITE_OFF", "ADJUST"] },
      NOT: { type: "ADJUST", quantity: { gt: 0 } },
      OR: [
        { createdAt: { lt: m.createdAt } },
        { createdAt: m.createdAt, id: { lt: m.id } },
      ],
    },
    _sum: { quantity: true },
  });
  return allocatedMovementCost(
    total,
    lot.qtyReceived,
    -(prior._sum.quantity ?? 0),
    m.quantity,
  );
}

export async function movementRates(
  tx: Prisma.TransactionClient,
  m: StockMovement,
  lot: Lot,
  at: Date,
) {
  const value = await tx.stockValuation.findUnique({
    where: { movementId: m.id },
  });
  return value
    ? {
        currency: value.currency as "TRY" | "USD" | "CAD" | "IRT",
        rateTry: value.rateTry.toFixed(12),
        rateUsd: value.rateUsd.toFixed(12),
        fxAsOf: value.createdAt.toISOString(),
        effectiveAt: at.toISOString(),
      }
    : costSnapshot(lot.unitCostCurrency, lot.fxRateSnapshot, at);
}
