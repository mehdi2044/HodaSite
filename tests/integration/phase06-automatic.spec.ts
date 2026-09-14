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
