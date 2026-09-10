import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { expireReservations, reserveStock } from "@/modules/inventory";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
let stockItemId = "";
let warehouseId = "";
let variantId = "";

describe.skipIf(!hasDb)("inventory reservation concurrency (D38)", () => {
  beforeEach(async () => {
    const stock = await db.stockItem.findFirstOrThrow({
      orderBy: { id: "asc" },
    });
    stockItemId = stock.id;
    warehouseId = stock.warehouseId;
    variantId = stock.variantId;
    await db.reservation.deleteMany({ where: { stockItemId } });
    await db.stockItem.update({
      where: { id: stockItemId },
      data: { onHand: 1, reserved: 0 },
    });
  });

  afterEach(async () => {
    await db.reservation.deleteMany({ where: { stockItemId } });
    await db.stockItem.update({
      where: { id: stockItemId },
      data: { onHand: 10, reserved: 0 },
    });
  });

  it("allows only one of two buyers to reserve the last unit", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const results = await Promise.allSettled(
      ["buyer-a", "buyer-b"].map((referenceId) =>
        reserveStock([
          {
            warehouseId,
            variantId,
            quantity: 1,
            kind: "HOLD",
            expiresAt,
            referenceId,
          },
        ]),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const stock = await db.stockItem.findUniqueOrThrow({
      where: { id: stockItemId },
    });
    expect(stock.reserved).toBe(1);
  });

  it("allows exactly five successes for 20 parallel workers on five units", async () => {
    await db.stockItem.update({
      where: { id: stockItemId },
      data: { onHand: 5, reserved: 0 },
    });
    const expiresAt = new Date(Date.now() + 60_000);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        reserveStock([
          {
            warehouseId,
            variantId,
            quantity: 1,
            kind: "HOLD",
            expiresAt,
            referenceId: `worker-${index}`,
          },
        ]),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(5);
    const stock = await db.stockItem.findUniqueOrThrow({
      where: { id: stockItemId },
    });
    expect(stock.reserved).toBe(5);
  });

  it("expires only HOLD reservations and releases their quantity", async () => {
    await reserveStock([
      {
        warehouseId,
        variantId,
        quantity: 1,
        kind: "HOLD",
        expiresAt: new Date(Date.now() - 1_000),
        referenceId: "expired-hold",
      },
    ]);
    expect(await expireReservations()).toBe(1);
    const stock = await db.stockItem.findUniqueOrThrow({
      where: { id: stockItemId },
    });
    expect(stock.reserved).toBe(0);
  });
});
