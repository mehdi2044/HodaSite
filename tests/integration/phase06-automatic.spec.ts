import { recognizeShipmentCost } from "@/modules/finance/shipment-posting";
import { configureCostMethod } from "@/modules/finance/operations";
import { receiveStock } from "@/modules/inventory";
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
const acting = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.id ? { user: { id: acting.id } } : null),
}));
vi.mock("@/modules/settings", () => ({ isMaintenanceOn: async () => false }));
import { db } from "@/lib/db";
import { returnFixture } from "../helpers/returns";
import { seedLedgerAccounts } from "../../prisma/ledger-seed";
import { approvePayment } from "@/modules/orders/service";
import { reserveOrderInventory } from "@/modules/inventory";
import { recognizePaidOrder } from "@/modules/finance/events";
import { requestReturn, manageReturn } from "@/modules/returns/service";
import { marginReport } from "@/modules/finance/margins";
import { reversePostedJournal } from "@/modules/finance/ledger";
let marketId = "";
async function fixture(pending = false) {
  const owner = await db.user.findUniqueOrThrow({
    where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
  });
  acting.id = owner.id;
  const f = await returnFixture(db, {
    pending,
    price: "100",
    quantity: 2,
    fxSnapshot: {
      marketPerUsd: "40",
      tryPerUsd: "40",
      quotedAt: new Date().toISOString(),
    },
  });
  marketId = f.market.id;
  for (const l of f.lots)
    await db.lot.update({
      where: { id: l.id },
      data: {
        unitCostAmountUsd: "0.05",
        fxRateSnapshot: {
          currency: "TRY",
          rateTry: "1",
          rateUsd: "0.025",
          fxAsOf: l.receivedAt.toISOString(),
          effectiveAt: l.receivedAt.toISOString(),
        },
      },
    });
  await seedLedgerAccounts(db);
  const data = { enabled: true, enabledAt: new Date(Date.now() - 60000) };
  await db.financeConfig.upsert({
    where: { id: marketId },
    create: { id: marketId, ...data },
    update: data,
  });
  return { ...f, owner };
}
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "phase06 automatic accounting",
  () => {
    afterEach(async () => {
      if (marketId)
        await db.financeConfig.update({
          where: { id: marketId },
          data: { enabled: false },
        });
      acting.id = null;
    });
    it("cash approval atomically posts balanced sale, payment and original-rate FIFO cost once", async () => {
      const f = await fixture(true);
      await db.$transaction((tx) =>
        reserveOrderInventory(
          tx,
          f.order.id,
          f.order.items,
          "HOLD",
          new Date(Date.now() + 60000),
        ),
      );
      await approvePayment(f.order.id, f.owner.id, true);
      await approvePayment(f.order.id, f.owner.id, true);
      const entries = await db.journalEntry.findMany({
        where: { memo: f.order.number },
        include: { lines: true },
      });
      expect(entries).toHaveLength(3);
      for (const e of entries) {
        expect(e.lines).toHaveLength(2);
        expect(e.lines[0].debit.toString()).toBe(e.lines[1].credit.toString());
        expect(e.lines[0].debitUsd.toString()).toBe(
          e.lines[1].creditUsd.toString(),
        );
      }
      const cogs = entries.find((e) => e.requestKey.startsWith("cogs:"))!;
      expect(cogs.lines.find((l) => l.debit.gt(0))?.debitUsd.toFixed(4)).toBe(
        "0.1000",
      );
      expect(
        await db.financeAttribution.count({ where: { orderId: f.order.id } }),
      ).toBe(2);
    });
    it("replaces absorbed shipping estimates once, with actual expense and its original FX", async () => {
      const f = await fixture(true);
      await db.orderFee.create({
        data: {
          orderId: f.order.id,
          type: "SHIPPING",
          label: "Fixture shipping",
          amount: "5",
          currency: "TRY",
          absorbed: true,
          ruleSnapshot: {},
        },
      });
      await db.$transaction((tx) =>
        reserveOrderInventory(
          tx,
          f.order.id,
          f.order.items,
          "HOLD",
          new Date(Date.now() + 60000),
        ),
      );
      await approvePayment(f.order.id, f.owner.id, true);
      await db.fxOverride.create({
        data: {
          marketId,
          rate: "40",
          validFrom: new Date(Date.now() - 1000),
          note: "Fixture",
          createdBy: f.owner.id,
        },
      });
      const input = {
        orderId: f.order.id,
        marketId,
        legId: randomUUID(),
        version: 1,
        amount: "9",
        currency: "TRY",
        actor: f.owner.id,
        at: new Date(),
      };
      await db.$transaction((tx) => recognizeShipmentCost(tx, input));
      await db.$transaction((tx) => recognizeShipmentCost(tx, input));
      const report = await marginReport({ marketId }, "order");
      expect(report.rows.find((r) => r.key === f.order.id)).toMatchObject({
        expenseTry: "9.0000",
        absorbedTry: "0.0000",
      });
      expect(
        await db.journalEntry.count({
          where: { requestKey: `shipment-cost:${input.legId}:1` },
        }),
      ).toBe(1);
    });
    it("uses moving average for sale and restores that exact cost on return", async () => {
      const f = await fixture(true),
        stock = f.stocks[0];
      await configureCostMethod({
        marketId,
        warehouseId: stock.warehouseId,
        variantId: stock.variantId,
        method: "AVERAGE",
        confirm: true,
      });
      const now = new Date();
      await receiveStock({
        warehouseId: stock.warehouseId,
        variantId: stock.variantId,
        quantity: 10,
        unitCostAmount: "4",
        unitCostCurrency: "TRY",
        unitCostAmountTry: "4",
        unitCostAmountUsd: "0.1",
        fxRateSnapshot: {
          currency: "TRY",
          rateTry: "1",
          rateUsd: "0.025",
          fxAsOf: now.toISOString(),
          effectiveAt: now.toISOString(),
        },
        receivedAt: now,
      });
      await db.$transaction((tx) =>
        reserveOrderInventory(
          tx,
          f.order.id,
          f.order.items,
          "HOLD",
          new Date(Date.now() + 60000),
        ),
      );
      await approvePayment(f.order.id, f.owner.id, true);
      let pool = await db.stockValue.findUniqueOrThrow({
        where: { stockItemId: stock.id },
      });
      expect(pool.quantity).toBe(18);
      expect(pool.amount.toFixed(4)).toBe("54.0000");
      expect(
        (
          await db.financeAttribution.findFirstOrThrow({
            where: { orderId: f.order.id, costTry: { gt: 0 } },
          })
        ).costTry.toFixed(4),
      ).toBe("6.0000");
      await db.order.update({
        where: { id: f.order.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      const r = await requestReturn(f.customer.id, {
        orderId: f.order.id,
        requestKey: randomUUID(),
        type: "RETURN",
        reasonCode: "SIZE",
        items: [{ orderItemId: f.order.items[0].id, quantity: 1 }],
      });
      await manageReturn(f.owner.id, {
        returnId: r.id,
        version: 0,
        operation: "APPROVE",
      });
      const item = await db.returnItem.findFirstOrThrow({
        where: { returnRequestId: r.id },
      });
      await manageReturn(f.owner.id, {
        returnId: r.id,
        version: 1,
        operation: "RECEIVE",
        conditions: [{ itemId: item.id, condition: "RESTOCK" }],
      });
      pool = await db.stockValue.findUniqueOrThrow({
        where: { stockItemId: stock.id },
      });
      expect(pool.quantity).toBe(19);
      expect(pool.amount.toFixed(4)).toBe("57.0000");
      await expect(
        configureCostMethod({
          marketId,
          warehouseId: stock.warehouseId,
          variantId: stock.variantId,
          method: "FIFO",
          confirm: true,
        }),
      ).rejects.toThrow();
      const value = await db.stockValuation.findFirstOrThrow({
        where: { stockItemId: stock.id },
      });
      await expect(
        db.stockValuation.update({
          where: { movementId: value.movementId },
          data: { amount: "1" },
        }),
      ).rejects.toThrow();
    });
    it("restock followed by another staff member's refund is idempotent and reduces margin exactly", async () => {
      const f = await fixture();
      await db.$transaction((tx) => recognizePaidOrder(tx, f.order.id, null));
      const r = await requestReturn(f.customer.id, {
        orderId: f.order.id,
        requestKey: randomUUID(),
        type: "RETURN",
        reasonCode: "SIZE",
        items: [{ orderItemId: f.order.items[0].id, quantity: 1 }],
      });
      await manageReturn(f.owner.id, {
        returnId: r.id,
        version: 0,
        operation: "APPROVE",
      });
      const item = await db.returnItem.findFirstOrThrow({
        where: { returnRequestId: r.id },
      });
      await manageReturn(f.owner.id, {
        returnId: r.id,
        version: 1,
        operation: "RECEIVE",
        conditions: [{ itemId: item.id, condition: "RESTOCK" }],
      });
      await manageReturn(f.owner.id, {
        returnId: r.id,
        version: 2,
        operation: "REFUND",
        note: "Fixture refund",
      });
      const report = await marginReport({ marketId }, "order");
      expect(report.rows.find((r) => r.key === f.order.id)).toMatchObject({
        revenueTry: "100.0000",
        costTry: "2.0000",
        grossTry: "98.0000",
        grossUsd: "2.4500",
      });
      const restocks = await db.journalEntry.findMany({
        where: { memo: f.order.number, requestKey: { startsWith: "restock:" } },
      });
      expect(restocks).toHaveLength(1);
      const entry = await db.journalEntry.findUniqueOrThrow({
        where: {
          marketId_requestKey: { marketId, requestKey: `sale:${f.order.id}` },
        },
      });
      await reversePostedJournal({
        entryId: entry.id,
        requestKey: randomUUID(),
        memo: "Fixture reversal",
        effectiveAt: new Date().toISOString(),
      });
      const amended = await marginReport({ marketId }, "order");
      expect(amended.rows.find((r) => r.key === f.order.id)?.revenueTry).toBe(
        "-100.0000",
      );
    });
  },
);
