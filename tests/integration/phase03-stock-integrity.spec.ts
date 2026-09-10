import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  adjustStock,
  receiveStock,
  receiveStockBatch,
  type ReceiveStockInput,
} from "@/modules/inventory";
async function fixture() {
  const variant = await db.variant.findFirstOrThrow();
  const warehouse = await db.warehouse.create({
    data: { code: `test-${randomUUID()}`, nameI18n: { en: "Test" } },
  });
  const input: ReceiveStockInput = {
    warehouseId: warehouse.id,
    variantId: variant.id,
    quantity: 2,
    unitCostAmount: "100",
    unitCostCurrency: "TRY",
    unitCostAmountTry: "100",
    unitCostAmountUsd: "2.5",
    fxRateSnapshot: { tryPerUsd: "40" },
    receivedAt: new Date(),
  };
  return input;
}
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "stock and lot consistency",
  () => {
    it("rolls every CSV row back when the final receipt fails", async () => {
      const input = await fixture();
      await expect(
        receiveStockBatch([
          input,
          { ...input, variantId: "zz-missing-variant" },
        ]),
      ).rejects.toThrow();
      expect(
        await db.stockItem.count({ where: { warehouseId: input.warehouseId } }),
      ).toBe(0);
      expect(
        await db.lot.count({ where: { warehouseId: input.warehouseId } }),
      ).toBe(0);
      expect(
        await db.stockMovement.count({
          where: { warehouseId: input.warehouseId },
        }),
      ).toBe(0);
    });
    it("commits valid batches together and decrements matching FIFO lots on adjustment", async () => {
      const input = await fixture();
      const rows = await receiveStockBatch([
        input,
        {
          ...input,
          quantity: 3,
          unitCostAmount: "200",
          unitCostAmountTry: "200",
          receivedAt: new Date(Date.now() + 1000),
        },
      ]);
      await adjustStock({
        stockItemId: rows[0].stock.id,
        quantity: -3,
        reason: "Damaged inventory",
        createdBy: (await db.user.findFirstOrThrow()).id,
      });
      expect(
        (
          await db.stockItem.findUniqueOrThrow({
            where: { id: rows[0].stock.id },
          })
        ).onHand,
      ).toBe(2);
      const lots = await db.lot.findMany({
        where: { warehouseId: input.warehouseId },
        orderBy: { receivedAt: "asc" },
      });
      expect(lots.map((lot) => lot.qtyRemaining)).toEqual([0, 2]);
      const movements = await db.stockMovement.findMany({
        where: { warehouseId: input.warehouseId, type: "ADJUST" },
      });
      expect(movements.map((movement) => movement.lotId).sort()).toEqual(
        lots.map((lot) => lot.id).sort(),
      );
      expect(
        movements.reduce((sum, movement) => sum + movement.quantity, 0),
      ).toBe(-3);
    });
    it("requires a cost basis for positive adjustments and records a new lot", async () => {
      const input = await fixture();
      const { stock } = await receiveStock(input);
      await expect(
        adjustStock({
          stockItemId: stock.id,
          quantity: 1,
          reason: "Stock count",
          createdBy: (await db.user.findFirstOrThrow()).id,
        }),
      ).rejects.toThrow("purchase cost");
      await adjustStock({
        stockItemId: stock.id,
        quantity: 1,
        reason: "Stock count",
        createdBy: (await db.user.findFirstOrThrow()).id,
        receipt: input,
      });
      expect(
        (await db.stockItem.findUniqueOrThrow({ where: { id: stock.id } }))
          .onHand,
      ).toBe(3);
      const totals = await db.lot.aggregate({
        where: { warehouseId: input.warehouseId },
        _sum: { qtyRemaining: true },
      });
      expect(totals._sum.qtyRemaining).toBe(3);
    });
  },
);
