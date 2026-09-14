import { Prisma, type Lot, type StockMovement } from "@prisma/client";
import { Exact } from "./operations-input";
import { allocatedMovementCost } from "./cost-snapshot";
export async function movementCost(
  tx: Prisma.TransactionClient,
  m: StockMovement,
  lot: Lot,
) {
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
      type: { in: ["OUT", "RETURN_RESTOCK", "WRITE_OFF"] },
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
