import { describe, expect, it } from "vitest";
import { fifoCogs, reserveStock } from "@/modules/inventory";

describe("inventory cost basis", () => {
  it("allocates FIFO across lots", () => {
    const result = fifoCogs(
      [
        {
          id: "old",
          qtyRemaining: 2,
          unitCostAmount: "10",
          unitCostCurrency: "USD",
          receivedAt: new Date("2026-01-01"),
        },
        {
          id: "new",
          qtyRemaining: 5,
          unitCostAmount: "12.5",
          unitCostCurrency: "USD",
          receivedAt: new Date("2026-02-01"),
        },
      ],
      4,
    );
    expect(result.amount).toBe("45");
    expect(result.allocations.map((x) => x.quantity)).toEqual([2, 2]);
  });

  it("rejects insufficient lots", () => {
    expect(() =>
      fifoCogs(
        [
          {
            id: "a",
            qtyRemaining: 1,
            unitCostAmount: "5",
            unitCostCurrency: "TRY",
            receivedAt: new Date(),
          },
        ],
        2,
      ),
    ).toThrow("Insufficient");
  });
});

describe("reservation request validation", () => {
  it("rejects a HOLD without an expiry before touching the database", async () => {
    await expect(
      reserveStock([
        {
          warehouseId: "warehouse",
          variantId: "variant",
          quantity: 1,
          kind: "HOLD",
        },
      ]),
    ).rejects.toThrow("HOLD reservations require an expiry time");
  });

  it("rejects an expiring VERIFICATION reservation", async () => {
    await expect(
      reserveStock([
        {
          warehouseId: "warehouse",
          variantId: "variant",
          quantity: 1,
          kind: "VERIFICATION",
          expiresAt: new Date(),
        },
      ]),
    ).rejects.toThrow("VERIFICATION reservations must not expire");
  });
});
