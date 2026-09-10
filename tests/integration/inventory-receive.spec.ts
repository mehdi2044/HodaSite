import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { receiveStock, snapshotPurchaseCost } from "@/modules/inventory";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDb)("inventory receiving and cost snapshots", () => {
  it("receives 100 units at 1000 TRY with immutable TRY/USD snapshots", async () => {
    const [warehouse, variant] = await Promise.all([
      db.warehouse.findFirstOrThrow({ where: { isActive: true } }),
      db.variant.findFirstOrThrow({ orderBy: { sku: "desc" } }),
    ]);
    const capturedAt = new Date();
    const snapshots = await snapshotPurchaseCost("1000", "TRY", capturedAt);
    const result = await receiveStock({
      warehouseId: warehouse.id,
      variantId: variant.id,
      quantity: 100,
      unitCostAmount: "1000",
      unitCostCurrency: "TRY",
      receivedAt: capturedAt,
      ...snapshots,
    });
    expect(result.lot.qtyReceived).toBe(100);
    expect(result.lot.qtyRemaining).toBe(100);
    expect(result.lot.unitCostAmount.toString()).toBe("1000");
    expect(result.lot.unitCostAmountTry.toString()).toBe("1000");
    expect(result.lot.unitCostAmountUsd.toString()).not.toBe("0");
    const movement = await db.stockMovement.findFirstOrThrow({
      where: { lotId: result.lot.id, type: "IN" },
    });
    expect(movement.quantity).toBe(100);
  });
});
