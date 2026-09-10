import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  can: vi.fn(),
  maintenance: vi.fn(),
  variant: vi.fn(),
  warehouse: vi.fn(),
  snapshot: vi.fn(),
  batch: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ auth: mock.auth }));
vi.mock("@/modules/access", async (original) => ({
  ...(await original<object>()),
  assertCan: mock.can,
}));
vi.mock("@/modules/settings", () => ({ isMaintenanceOn: mock.maintenance }));
vi.mock("@/lib/db", () => ({
  db: {
    variant: { findUniqueOrThrow: mock.variant },
    warehouse: { findFirstOrThrow: mock.warehouse },
  },
}));
vi.mock("@/modules/inventory", () => ({
  receiveStock: vi.fn(),
  adjustStock: vi.fn(),
  snapshotPurchaseCost: mock.snapshot,
  receiveStockBatch: mock.batch,
}));
import { importInventoryCsv } from "@/app/admin/(dashboard)/inventory/actions";
import { inFlightCount } from "@/lib/request-metrics";
const csv = (body: string) => {
  const data = new FormData();
  data.set("file", new File([body], "stock.csv", { type: "text/csv" }));
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ user: { id: "warehouse-user" } });
  mock.can.mockResolvedValue(undefined);
  mock.maintenance.mockResolvedValue(false);
  mock.variant.mockImplementation(
    async ({ where }: { where: { sku: string } }) => {
      if (where.sku === "missing") throw new Error("Unknown SKU");
      return { id: where.sku };
    },
  );
  mock.warehouse.mockResolvedValue({ id: "IST" });
  mock.snapshot.mockResolvedValue({
    unitCostAmountTry: "100",
    unitCostAmountUsd: "2.5",
    fxRateSnapshot: {},
  });
  mock.batch.mockResolvedValue([]);
});
it("rejects CSV writes during maintenance and balances the drain counter", async () => {
  mock.maintenance.mockResolvedValue(true);
  expect(
    await importInventoryCsv(
      null,
      csv("sku,quantity,unitCost,currency\na,1,100,TRY"),
    ),
  ).toMatchObject({ ok: false, code: "MAINTENANCE" });
  expect(mock.batch).not.toHaveBeenCalled();
  expect(inFlightCount()).toBe(0);
});
it("validates all rows before any receipt is committed", async () => {
  await expect(
    importInventoryCsv(
      null,
      csv("sku,quantity,unitCost,currency\na,1,100,TRY\nmissing,2,100,TRY"),
    ),
  ).rejects.toThrow("Unknown SKU");
  expect(mock.batch).not.toHaveBeenCalled();
  expect(inFlightCount()).toBe(0);
});
it("keeps the whole import counted until its transaction finishes", async () => {
  mock.batch.mockImplementation(async (rows: unknown[]) => {
    expect(inFlightCount()).toBe(1);
    expect(rows).toHaveLength(2);
  });
  expect(
    await importInventoryCsv(
      null,
      csv("sku,quantity,unitCost,currency\na,1,100,TRY\nb,2,100,TRY"),
    ),
  ).toEqual({ ok: true });
  expect(mock.batch).toHaveBeenCalledTimes(1);
  expect(inFlightCount()).toBe(0);
});
it("does not write anything when a cost conversion fails", async () => {
  mock.snapshot.mockRejectedValueOnce(new Error("No historical FX rate"));
  await expect(
    importInventoryCsv(
      null,
      csv("sku,quantity,unitCost,currency\na,1,100,TRY"),
    ),
  ).rejects.toThrow("historical");
  expect(mock.batch).not.toHaveBeenCalled();
});
