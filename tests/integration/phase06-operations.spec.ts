import { operationsMetrics } from "@/modules/finance/metrics";
import { POST as uploadExpense } from "@/app/api/admin/finance/attachments/route";
import { GET as downloadExpense } from "@/app/api/admin/finance/attachments/[id]/route";
import { GET as publicMedia } from "@/app/media/[...key]/route";
import { marginReport } from "@/modules/finance/margins";
import { GET as marginExport } from "@/app/admin/(dashboard)/finance/margins/export/route";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const acting = vi.hoisted(() => ({
  id: null as string | null,
  maintenance: false,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.id ? { user: { id: acting.id } } : null),
}));
vi.mock("@/modules/settings", () => ({
  isMaintenanceOn: async () => acting.maintenance,
}));
import { db } from "@/lib/db";
import { financialOperation } from "@/app/admin/(dashboard)/finance/operations/actions";
import {
  createSupplier,
  createPurchase,
  receivePurchase,
  createExpense,
  approveExpense,
  createPartner,
  createCapital,
  saveFinanceConfig,
} from "@/modules/finance/operations";
import {
  financeWorkspace,
  financeDashboard,
} from "@/modules/finance/dashboard";
import { seedLedgerAccounts } from "../../prisma/ledger-seed";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  granted,
  matrixSubjects,
  fingerprint,
  type MatrixSubject,
} from "../helpers/permission-subjects";
let subjects: MatrixSubject[] = [],
  tr = "",
  ir = "",
  owner = "",
  variant = "",
  warehouse = "",
  supplier = "";
const rates = {
  currency: "TRY",
  rateTry: "1",
  rateUsd: "0.025",
  fxAsOf: "2008-01-01T00:00:00Z",
  effectiveAt: "2008-01-01T00:00:00Z",
};
const tables = [
  "Supplier",
  "PurchaseOrder",
  "PurchaseOrderItem",
  "Expense",
  "Partner",
  "CapitalTransaction",
  "JournalEntry",
  "JournalLine",
  "StockItem",
  "Lot",
  "StockMovement",
  "AuditLog",
];
const expense = (marketId = tr) => ({
  marketId,
  requestKey: randomUUID(),
  memo: "Operations test",
  confirm: true,
  snapshot: rates,
  amount: "12.0001",
  category: "Fixtures",
  recurrenceMonths: 0,
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "phase06 operations permissions and integrity",
  () => {
    beforeAll(async () => {
      subjects = await matrixSubjects();
      tr = (await db.market.findUniqueOrThrow({ where: { code: "TR" } })).id;
      ir = (await db.market.findUniqueOrThrow({ where: { code: "IR" } })).id;
      owner = subjects.find((s) => s.name === "owner" && s.scope === "in")!.id!;
      acting.id = owner;
      variant = (
        await db.variant.findFirstOrThrow({
          where: { product: { deletedAt: null, marketIds: { has: tr } } },
        })
      ).id;
      warehouse = (await db.warehouse.findFirstOrThrow()).id;
      await seedLedgerAccounts(db);
      supplier = await createSupplier({
        marketId: tr,
        name: "Operations supplier",
      });
    }, 60000);
    afterAll(() => {
      acting.id = null;
      acting.maintenance = false;
    });
    for (const name of SUBJECTS)
      for (const scope of GLOBAL_SCOPES)
        for (const target of ["TR", "IR"]) {
          it(`finance.expense.create ${name}/${scope}/${target} through action and crafted request`, async () => {
            acting.id = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const allowed =
              granted(name, "finance.expense.create") &&
              (scope === "in" || (scope === "market-out" && target === "TR"));
            const input = expense(target === "TR" ? tr : ir),
              before = await fingerprint(tables);
            const result = await financialOperation("expense", input);
            const crafted = await financialOperation("expense", {
              ...input,
              actorId: owner,
              userId: owner,
              role: "owner",
            });
            expect(result.ok).toBe(allowed);
            expect(crafted.ok).toBe(allowed);
            if (allowed) {
              expect(result).toEqual(crafted);
              expect(
                await db.expense.count({
                  where: {
                    marketId: input.marketId,
                    requestKey: input.requestKey,
                  },
                }),
              ).toBe(1);
            } else {
              expect(result).toMatchObject({
                code: name === "anonymous" ? "UNAUTHORIZED" : "FORBIDDEN",
              });
              expect(await fingerprint(tables)).toEqual(before);
            }
          });
          it(`finance expense document ${name}/${scope}/${target}`, async () => {
            acting.id = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const marketId = target === "TR" ? tr : ir;
            const allowed =
              granted(name, "finance.expense.create") &&
              (scope === "in" || (scope === "market-out" && target === "TR"));
            const form = new FormData();
            form.set(
              "file",
              new File(["%PDF-1.4\nFixture PDF\n%%EOF"], "fixture.pdf", {
                type: "application/pdf",
              }),
            );
            const before = await fingerprint(["Media", "AuditLog"]);
            const result = await uploadExpense(
              new Request(
                `https://example.com/api/admin/finance/attachments?marketId=${marketId}`,
                { method: "POST", body: form },
              ),
            );
            expect(result.status).toBe(
              allowed ? 201 : name === "anonymous" ? 401 : 403,
            );
            if (!allowed) {
              expect(await fingerprint(["Media", "AuditLog"])).toEqual(before);
              return;
            }
            const { id } = (await result.json()) as { id: string };
            expect(
              (
                await downloadExpense(new Request("https://example.com"), {
                  params: Promise.resolve({ id }),
                })
              ).status,
            ).toBe(200);
            const media = await db.media.findUniqueOrThrow({ where: { id } });
            expect(
              (
                await publicMedia(new Request("https://example.com"), {
                  params: Promise.resolve({ key: media.storageKey.split("/") }),
                })
              ).status,
            ).toBe(404);
            await createExpense({ ...expense(marketId), attachmentId: id });
            await expect(
              db.media.update({ where: { id }, data: { kind: "document" } }),
            ).rejects.toThrow();
            const previous = acting.id;
            acting.id = null;
            expect(
              (
                await downloadExpense(new Request("https://example.com"), {
                  params: Promise.resolve({ id }),
                })
              ).status,
            ).toBe(404);
            acting.id = previous;
          });
          it(`finance.journal.post ${name}/${scope}/${target} supplier and direct forbidden write`, async () => {
            acting.id = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const allowed =
              granted(name, "finance.journal.post") &&
              (scope === "in" || (scope === "market-out" && target === "TR"));
            const before = await fingerprint(tables);
            const result = await financialOperation("supplier", {
              marketId: target === "TR" ? tr : ir,
              name: "Matrix supplier",
            });
            expect(result.ok).toBe(allowed);
            if (!allowed) expect(await fingerprint(tables)).toEqual(before);
          });
          it(`finance configuration operations ${name}/${scope}/${target}`, async () => {
            acting.id = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const marketId = target === "TR" ? tr : ir;
            const allowed =
              granted(name, "finance.journal.post") &&
              (scope === "in" || (scope === "market-out" && target === "TR"));
            const before = await fingerprint([...tables, "SystemAlert"]);
            const alerts = await financialOperation("alerts", {
              marketId,
              confirm: true,
            });
            expect(alerts.ok).toBe(allowed);
            const opening = await financialOperation("opening", {
              marketId,
              warehouseId: warehouse,
              requestKey: randomUUID(),
              memo: "Opening matrix",
              snapshot: rates,
              confirm: true,
            });
            expect(opening.ok).toBe(allowed);
            if (!allowed)
              expect(await fingerprint([...tables, "SystemAlert"])).toEqual(
                before,
              );
          });
          it(`finance.report.view ${name}/${scope}/${target} workspace and profit`, async () => {
            acting.id = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const allowed =
              granted(name, "finance.report.view") &&
              (scope === "in" || (scope === "market-out" && target === "TR"));
            const id = target === "TR" ? tr : ir;
            if (allowed) {
              expect(await operationsMetrics({ marketId: id })).toHaveProperty(
                "payments",
              );
              expect(await marginReport({ marketId: id })).toHaveProperty(
                "rows",
              );
              const exported = await marginExport(
                new Request(
                  `https://example.com/admin/finance/margins/export?marketId=${id}&format=xlsx`,
                ),
              );
              expect(exported.status).toBe(200);
              expect(exported.headers.get("Cache-Control")).toBe(
                "private, no-store",
              );
              expect(await financeWorkspace(id)).toHaveProperty("purchases");
              expect(
                await financeDashboard({
                  marketId: id,
                  from: "2008-01-01",
                  to: "2008-01-01",
                }),
              ).toHaveProperty("totals");
            } else {
              await expect(
                operationsMetrics({ marketId: id }),
              ).rejects.toThrow();
              await expect(marginReport({ marketId: id })).rejects.toThrow();
              expect(
                (
                  await marginExport(
                    new Request(
                      `https://example.com/admin/finance/margins/export?marketId=${id}`,
                    ),
                  )
                ).status,
              ).toBe(name === "anonymous" ? 401 : 403);
              await expect(financeWorkspace(id)).rejects.toThrow();
              await expect(
                financeDashboard({ marketId: id }),
              ).rejects.toThrow();
            }
          });
        }
    it("creates a recurring installment once with explicit new FX and date", async () => {
      acting.id = owner;
      const source = await createExpense({
        ...expense(),
        recurrenceMonths: 1,
        snapshot: { ...rates, effectiveAt: "2008-01-31T00:00:00Z" },
      });
      await approveExpense({ id: source, confirm: true });
      const input = {
        ...expense(),
        recurringSourceId: source,
        recurrenceMonths: 1,
        snapshot: {
          ...rates,
          effectiveAt: "2008-02-29T00:00:00Z",
          fxAsOf: "2008-02-29T00:00:00Z",
          rateUsd: "0.03",
        },
      };
      const [a, b] = await Promise.all([
        createExpense(input),
        createExpense({ ...input, requestKey: randomUUID() }),
      ]);
      expect(a).toBe(b);
      expect(
        (
          await db.expense.findUniqueOrThrow({ where: { id: a } })
        ).rateUsd.toString(),
      ).toBe("0.03");
      await expect(
        createExpense({
          ...input,
          requestKey: randomUUID(),
          snapshot: { ...input.snapshot, effectiveAt: "2008-03-02T00:00:00Z" },
        }),
      ).rejects.toThrow();
    });
    it("receives exactly once under concurrency and protects finalized purchase/stock/history", async () => {
      acting.id = owner;
      const input = {
        marketId: tr,
        requestKey: randomUUID(),
        memo: "100 piece proof",
        confirm: true,
        snapshot: rates,
        supplierId: supplier,
        warehouseId: warehouse,
        additionalCost: "2000",
        allocation: "VALUE",
        items: [
          {
            variantId: variant,
            quantity: 100,
            purchaseTotal: "100000",
            weight: "1",
          },
        ],
      };
      const [a, b] = await Promise.all([
        createPurchase(input),
        createPurchase(input),
      ]);
      expect(a).toBe(b);
      await Promise.all([
        receivePurchase({ id: a, confirm: true }),
        receivePurchase({ id: a, confirm: true }),
      ]);
      const row = await db.purchaseOrder.findUniqueOrThrow({
        where: { id: a },
        include: { items: true },
      });
      expect(row.status).toBe("RECEIVED");
      const item = row.items[0];
      const lot = await db.lot.findUniqueOrThrow({
        where: { id: item.lotId! },
      });
      expect(lot.unitCostAmount.toString()).toBe("1020");
      expect(lot.unitCostAmountUsd.toString()).toBe("25.5");
      expect(
        await db.stockMovement.count({ where: { lotId: lot.id, type: "IN" } }),
      ).toBe(1);
      await expect(
        db.$executeRaw`UPDATE "PurchaseOrder" SET currency='USD' WHERE id=${a}`,
      ).rejects.toThrow();
      await expect(
        db.$executeRaw`DELETE FROM "PurchaseOrderItem" WHERE id=${item.id}`,
      ).rejects.toThrow();
      await expect(
        createPurchase({ ...input, memo: "changed" }),
      ).rejects.toThrow();
    });
    it("requires explicit approval and preserves expense/capital journals", async () => {
      acting.id = owner;
      const id = await createExpense(expense());
      const old = await db.expense.findUniqueOrThrow({ where: { id } });
      expect(old.journalId).toBeNull();
      await expect(approveExpense({ id, confirm: false })).rejects.toThrow();
      await Promise.all([
        approveExpense({ id, confirm: true }),
        approveExpense({ id, confirm: true }),
      ]);
      expect(
        await db.journalEntry.count({
          where: { marketId: tr, requestKey: `expense:${id}` },
        }),
      ).toBe(1);
      await expect(
        db.$executeRaw`UPDATE "Expense" SET amount=1 WHERE id=${id}`,
      ).rejects.toThrow();
      const partner = await createPartner({
        marketId: tr,
        name: "Test partner",
        ownershipPercent: "0.0001",
      });
      const input = { ...expense(), partnerId: partner, kind: "CONTRIBUTION" };
      const capital = await createCapital(input);
      expect(await createCapital(input)).toBe(capital);
      await expect(
        db.$executeRaw`DELETE FROM "CapitalTransaction" WHERE id=${capital}`,
      ).rejects.toThrow();
    });
    it("blocks mutations during maintenance and cannot activate via a forged actor", async () => {
      acting.id = owner;
      acting.maintenance = true;
      await expect(createExpense(expense())).rejects.toThrow();
      acting.maintenance = false;
      acting.id = subjects.find(
        (s) => s.name === "warehouse" && s.scope === "in",
      )!.id;
      await expect(
        saveFinanceConfig({
          marketId: tr,
          enabled: true,
          marginPercent: "10",
          slowDays: 90,
          deviationPercent: "50",
          confirm: true,
        }),
      ).rejects.toThrow("FORBIDDEN");
    });
  },
);
