import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ cost: false, lots: vi.fn() }));
vi.mock("@/modules/auth", () => ({
  auth: async () => ({ user: { id: "warehouse-user" } }),
}));
vi.mock("@/modules/access", () => ({
  assertCan: async () => {
    if (!mock.cost) throw new Error("FORBIDDEN");
  },
  can: async (_id: string, permission: string) =>
    permission === "pricing.cost.view" ? mock.cost : true,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/db", () => ({
  db: {
    warehouse: { findMany: async () => [] },
    variant: { findMany: async () => [] },
    stockItem: { findMany: async () => [] },
    lot: { findMany: mock.lots },
    stockMovement: { findMany: async () => [] },
    siteSettings: { findUniqueOrThrow: async () => ({ inventory: {} }) },
  },
}));
vi.mock("@/components/ui", () => ({
  Card: "div",
  Input: "input",
  Select: "select",
  Table: "table",
  TD: "td",
  TH: "th",
}));
vi.mock("@/components/admin/catalog-action-form", () => ({
  CatalogActionForm: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/app/admin/(dashboard)/inventory/actions", () => ({
  adjustInventory: vi.fn(),
  importInventoryCsv: vi.fn(),
  receiveInventory: vi.fn(),
  saveGlobalLowStockThreshold: vi.fn(),
  saveStockLowStockThreshold: vi.fn(),
}));
import InventoryPage from "@/app/admin/(dashboard)/inventory/page";
beforeEach(() => {
  vi.stubGlobal("React", React);
  mock.cost = false;
  mock.lots.mockReset().mockResolvedValue([
    {
      id: "lot",
      variant: { sku: "SKU" },
      qtyReceived: 1,
      qtyRemaining: 1,
      unitCostAmount: "987654",
      unitCostCurrency: "TRY",
      unitCostAmountTry: "987654",
      unitCostAmountUsd: "12345",
      receivedAt: new Date(),
    },
  ]);
});
it("does not query or render lot costs for warehouse-only users", async () => {
  const html = renderToStaticMarkup(
    await InventoryPage({ searchParams: Promise.resolve({}) }),
  );
  expect(mock.lots).not.toHaveBeenCalled();
  expect(html).not.toContain("987654");
  expect(html).not.toContain("originalCost");
});
it("allows costs for a user with the separate permission", async () => {
  mock.cost = true;
  const html = renderToStaticMarkup(
    await InventoryPage({ searchParams: Promise.resolve({}) }),
  );
  expect(mock.lots).toHaveBeenCalledTimes(1);
  expect(html).toContain("987654");
});
