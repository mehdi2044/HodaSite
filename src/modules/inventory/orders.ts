import { Prisma } from "@prisma/client";

export class InsufficientOrderStock extends Error {}
type Tx = Prisma.TransactionClient;
type Item = { variantId: string; quantity: number };
type Stock = {
  id: string;
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
};

/** Called inside the order transaction; reserve all requested lines or none. */
export async function reserveOrderInventory(
  tx: Tx,
  orderId: string,
  items: readonly Item[],
  kind: "HOLD" | "VERIFICATION",
  expiresAt: Date | null,
) {
  if (!items.length) return;
  const ids = [...new Set(items.map((i) => i.variantId))].sort();
  const stocks = await tx.$queryRaw<
    Stock[]
  >`SELECT id,"warehouseId","variantId","onHand",reserved FROM "StockItem" WHERE "variantId" IN (${Prisma.join(ids)}) ORDER BY "variantId","warehouseId",id FOR UPDATE`;
  const plan: { stock: Stock; quantity: number }[] = [];
  for (const item of [...items].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  )) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
      throw new InsufficientOrderStock();
    let needed = item.quantity;
    for (const stock of stocks.filter((s) => s.variantId === item.variantId)) {
      const used = plan
        .filter((p) => p.stock.id === stock.id)
        .reduce((n, p) => n + p.quantity, 0);
      const quantity = Math.min(needed, stock.onHand - stock.reserved - used);
      if (quantity > 0) {
        plan.push({ stock, quantity });
        needed -= quantity;
      }
    }
    if (needed) throw new InsufficientOrderStock();
  }
  for (const { stock, quantity } of plan) {
    await tx.stockItem.update({
      where: { id: stock.id },
      data: { reserved: { increment: quantity } },
    });
    await tx.reservation.create({
      data: {
        stockItemId: stock.id,
        warehouseId: stock.warehouseId,
        variantId: stock.variantId,
        quantity,
        kind,
        expiresAt,
        orderId,
        referenceId: orderId,
      },
    });
  }
}
async function activeReservations(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Reservation" WHERE "orderId"=${orderId} AND status='ACTIVE' ORDER BY "variantId",id FOR UPDATE`;
  return tx.reservation.findMany({
    where: { orderId, status: "ACTIVE" },
    orderBy: [{ variantId: "asc" }, { id: "asc" }],
  });
}
export async function releaseOrderInventory(tx: Tx, orderId: string) {
  for (const row of await activeReservations(tx, orderId)) {
    await tx.stockItem.update({
      where: { id: row.stockItemId },
      data: { reserved: { decrement: row.quantity } },
    });
    await tx.reservation.update({
      where: { id: row.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }
}
export async function verifyOrderInventory(
  tx: Tx,
  orderId: string,
  items: readonly Item[],
  now = new Date(),
) {
  let rows = await activeReservations(tx, orderId);
  for (const row of rows)
    if (row.kind === "HOLD" && row.expiresAt && row.expiresAt <= now) {
      await tx.stockItem.update({
        where: { id: row.stockItemId },
        data: { reserved: { decrement: row.quantity } },
      });
      await tx.reservation.update({
        where: { id: row.id },
        data: { status: "EXPIRED", releasedAt: now },
      });
    }
  rows = await activeReservations(tx, orderId);
  const missing = items
    .map((item) => ({
      ...item,
      quantity:
        item.quantity -
        rows
          .filter((r) => r.variantId === item.variantId)
          .reduce((n, r) => n + r.quantity, 0),
    }))
    .filter((i) => i.quantity > 0);
  try {
    await reserveOrderInventory(tx, orderId, missing, "VERIFICATION", null);
  } catch (error) {
    if (!(error instanceof InsufficientOrderStock)) throw error;
    await releaseOrderInventory(tx, orderId);
    return false;
  }
  await tx.reservation.updateMany({
    where: { orderId, status: "ACTIVE" },
    data: { kind: "VERIFICATION", expiresAt: null },
  });
  return true;
}
export async function consumeOrderInventory(
  tx: Tx,
  orderId: string,
  userId: string,
) {
  const rows = await activeReservations(tx, orderId);
  for (const row of rows) {
    const [stock] = await tx.$queryRaw<
      Stock[]
    >`SELECT id,"warehouseId","variantId","onHand",reserved FROM "StockItem" WHERE id=${row.stockItemId} FOR UPDATE`;
    if (!stock || stock.onHand < row.quantity || stock.reserved < row.quantity)
      throw new InsufficientOrderStock();
    const lots = await tx.lot.findMany({
      where: {
        variantId: row.variantId,
        warehouseId: row.warehouseId,
        qtyRemaining: { gt: 0 },
      },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    let remaining = row.quantity;
    for (const lot of lots) {
      const take = Math.min(remaining, lot.qtyRemaining);
      if (!take) break;
      await tx.lot.update({
        where: { id: lot.id },
        data: { qtyRemaining: { decrement: take } },
      });
      await tx.stockMovement.create({
        data: {
          stockItemId: stock.id,
          warehouseId: stock.warehouseId,
          variantId: stock.variantId,
          lotId: lot.id,
          type: "OUT",
          quantity: -take,
          referenceId: orderId,
          createdBy: userId,
        },
      });
      remaining -= take;
    }
    if (remaining) throw new InsufficientOrderStock();
    await tx.stockItem.update({
      where: { id: stock.id },
      data: {
        onHand: { decrement: row.quantity },
        reserved: { decrement: row.quantity },
      },
    });
    await tx.reservation.update({
      where: { id: row.id },
      data: { status: "CONSUMED", releasedAt: new Date() },
    });
  }
}
