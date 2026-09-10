import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => {
  const db = {
    market: { findMany: vi.fn() },
    stockItem: { upsert: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    lot: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    stockMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    reservation: { create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return { db, rate: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("@/modules/pricing", () => ({ getRateAt: m.rate }));
import {
  adjustStock,
  availableForVariant,
  cogsForSale,
  expireReservations,
  fifoCogs,
  receiveStock,
  receiveStockBatch,
  reserveStock,
  snapshotPurchaseCost,
} from "@/modules/inventory";
const input = {
  warehouseId: "w",
  variantId: "v",
  quantity: 2,
  unitCostAmount: "100",
  unitCostCurrency: "TRY",
  unitCostAmountTry: "100",
  unitCostAmountUsd: "2.5",
  fxRateSnapshot: {},
  receivedAt: new Date("2026-01-01"),
  createdBy: "operator",
};
const lots = [
  {
    id: "a",
    qtyRemaining: 2,
    unitCostAmount: "100",
    unitCostCurrency: "TRY",
    unitCostAmountTry: "100",
    unitCostAmountUsd: "2.5",
    receivedAt: new Date("2026-01-01"),
  },
  {
    id: "b",
    qtyRemaining: 5,
    unitCostAmount: "200",
    unitCostCurrency: "TRY",
    unitCostAmountTry: "200",
    unitCostAmountUsd: "5",
    receivedAt: new Date("2026-02-01"),
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  m.db.$transaction.mockImplementation(
    async (fn: (db: typeof m.db) => Promise<unknown>) => fn(m.db),
  );
  m.db.$queryRaw.mockResolvedValue([
    { id: "stock", warehouseId: "w", variantId: "v", onHand: 7, reserved: 0 },
  ]);
  m.db.stockItem.upsert.mockResolvedValue({ id: "stock" });
  m.db.lot.create.mockResolvedValue({ id: "lot" });
  m.db.stockMovement.create.mockResolvedValue({ id: "movement" });
  m.db.lot.findMany.mockResolvedValue(lots);
  m.db.reservation.create.mockResolvedValue({ id: "reservation" });
  m.db.market.findMany.mockResolvedValue([
    { id: "TR", code: "TR", currency: "TRY" },
    { id: "CA", code: "CA", currency: "CAD" },
    { id: "IR", code: "IR", currency: "IRT" },
  ]);
  m.rate.mockImplementation(async (market: { currency: string }) => ({
    rate: market.currency === "TRY" ? "40" : "2",
  }));
});
it.each([
  ["TRY", "100", "2.5"],
  ["USD", "4000", "100"],
  ["CAD", "2000", "50"],
  ["IRT", "2000", "50"],
] as const)(
  "captures historical purchase costs in %s",
  async (currency, tryAmount, usdAmount) => {
    expect(
      await snapshotPurchaseCost("100", currency, input.receivedAt),
    ).toMatchObject({
      unitCostAmountTry: tryAmount,
      unitCostAmountUsd: usdAmount,
      fxRateSnapshot: {
        capturedAt: input.receivedAt.toISOString(),
        originalCurrency: currency,
      },
    });
    expect(m.rate).toHaveBeenCalledWith(expect.anything(), input.receivedAt);
  },
);
it("fails when required historical market rates or positive costs are missing", async () => {
  await expect(snapshotPurchaseCost("0", "TRY")).rejects.toThrow("positive");
  m.db.market.findMany.mockResolvedValueOnce([]);
  await expect(snapshotPurchaseCost("1", "USD")).rejects.toThrow("TRY market");
  m.db.market.findMany.mockResolvedValueOnce([{ id: "TR", currency: "TRY" }]);
  await expect(snapshotPurchaseCost("1", "CAD")).rejects.toThrow(
    "required for CAD",
  );
});
it.each(["TRY", "USD"] as const)(
  "computes FIFO using %s snapshots",
  async (currency) => {
    expect((await cogsForSale("v", 3, currency)).amount).toBe(
      currency === "TRY" ? "400" : "10",
    );
  },
);
it("validates FIFO quantities and currency consistency", () => {
  expect(() => fifoCogs(lots, 0)).toThrow("positive");
  expect(fifoCogs([{ ...lots[0], qtyRemaining: 0 }, lots[1]], 1).amount).toBe(
    "200",
  );
  expect(() =>
    fifoCogs([lots[0], { ...lots[1], unitCostCurrency: "USD" }], 3),
  ).toThrow("one snapshot currency");
});
it("receives stock and links its immutable movement to the cost lot", async () => {
  await receiveStock(input);
  expect(m.db.stockMovement.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      lotId: "lot",
      stockItemId: "stock",
      type: "IN",
      quantity: 2,
    }),
  });
  expect(m.db.auditLog.create).toHaveBeenCalled();
});
it("validates receipts and batches before entering a transaction", async () => {
  await expect(receiveStock({ ...input, quantity: -1 })).rejects.toThrow(
    "positive",
  );
  await expect(receiveStockBatch([])).rejects.toThrow("Invalid");
  await expect(receiveStockBatch([{ ...input, quantity: 0 }])).rejects.toThrow(
    "Invalid",
  );
  expect(m.db.$transaction).not.toHaveBeenCalled();
});
it("receives every batch row inside one transaction", async () => {
  await receiveStockBatch([input, { ...input, variantId: "a" }]);
  expect(m.db.$transaction).toHaveBeenCalledTimes(1);
  expect(m.db.lot.create).toHaveBeenCalledTimes(2);
});
it("prevents adjustments from crossing reserved stock", async () => {
  await expect(
    adjustStock({
      stockItemId: "stock",
      quantity: -8,
      reason: "Count",
      createdBy: "operator",
    }),
  ).rejects.toThrow("negative");
  expect(m.db.lot.update).not.toHaveBeenCalled();
});
it("allocates negative adjustments to FIFO lots", async () => {
  await adjustStock({
    stockItemId: "stock",
    quantity: -3,
    reason: "Count",
    createdBy: "operator",
  });
  expect(
    m.db.lot.update.mock.calls.map(([arg]) => arg.data.qtyRemaining.decrement),
  ).toEqual([2, 1]);
  expect(m.db.stockItem.update).toHaveBeenCalledWith({
    where: { id: "stock" },
    data: { onHand: { increment: -3 } },
  });
});
it("refuses missing cost lots and zero adjustments", async () => {
  m.db.lot.findMany.mockResolvedValue([]);
  await expect(
    adjustStock({
      stockItemId: "stock",
      quantity: -1,
      reason: "Count",
      createdBy: "operator",
    }),
  ).rejects.toThrow("Insufficient lots");
  await expect(
    adjustStock({
      stockItemId: "stock",
      quantity: 0,
      reason: "Count",
      createdBy: "operator",
    }),
  ).rejects.toThrow("Invalid");
});
it("requires cost snapshots for positive adjustments", async () => {
  await expect(
    adjustStock({
      stockItemId: "stock",
      quantity: 1,
      reason: "Count",
      createdBy: "operator",
    }),
  ).rejects.toThrow("purchase cost");
  await adjustStock({
    stockItemId: "stock",
    quantity: 1,
    reason: "Count",
    createdBy: "operator",
    receipt: input,
  });
  expect(m.db.stockMovement.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      type: "ADJUST",
      quantity: 1,
      reason: "Count",
      lotId: "lot",
    }),
  });
});
it("reserves stock with a fixed lock order and enforces availability", async () => {
  const request = {
    warehouseId: "w",
    variantId: "v",
    quantity: 2,
    kind: "HOLD" as const,
    expiresAt: new Date(),
  };
  expect(
    await reserveStock([
      request,
      {
        ...request,
        variantId: "a",
        kind: "VERIFICATION",
        expiresAt: undefined,
      },
    ]),
  ).toHaveLength(2);
  await expect(reserveStock([{ ...request, quantity: 8 }])).rejects.toThrow(
    "Insufficient",
  );
  await expect(reserveStock([{ ...request, quantity: 0 }])).rejects.toThrow(
    "positive",
  );
});
it("retries transient transaction failures and stops at the retry limit", async () => {
  const request = {
    warehouseId: "w",
    variantId: "v",
    quantity: 1,
    kind: "VERIFICATION" as const,
  };
  const error = new Prisma.PrismaClientKnownRequestError("retry", {
    code: "P2034",
    clientVersion: "6.19.3",
  });
  m.db.$transaction.mockRejectedValueOnce(error);
  expect(await reserveStock([request])).toHaveLength(1);
  m.db.$transaction.mockReset().mockRejectedValue(error);
  await expect(reserveStock([request])).rejects.toThrow("retry");
  expect(m.db.$transaction).toHaveBeenCalledTimes(8);
});
it("expires holds and releases their reserved quantity", async () => {
  m.db.$queryRaw.mockResolvedValue([
    { id: "hold", stockItemId: "stock", quantity: 2 },
  ]);
  expect(await expireReservations()).toBe(1);
  expect(m.db.stockItem.update).toHaveBeenCalledWith({
    where: { id: "stock" },
    data: { reserved: { decrement: 2 } },
  });
});
it("reports zero for absent stock and subtracts reservations", async () => {
  m.db.stockItem.aggregate
    .mockResolvedValueOnce({ _sum: { onHand: null, reserved: null } })
    .mockResolvedValueOnce({ _sum: { onHand: 5, reserved: 3 } });
  expect(await availableForVariant("v")).toBe(0);
  expect(await availableForVariant("v")).toBe(2);
});
