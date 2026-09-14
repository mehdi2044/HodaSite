import { initializeAverage } from "./average-cost";
import { scanStockAlerts } from "./alerts";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { auth } from "@/modules/auth";
import {
  evaluateAccess,
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/access";
import { receiveStockInTransaction } from "@/modules/inventory";
import { allocateLandedCost } from "./calculations";
import { journalHash } from "./journal-input";
import { postPair } from "./posting";
import {
  positive,
  snapshot,
  nextExpenseDate,
  capitalInput,
  expenseInput,
  purchaseInput,
  identifier,
  Exact,
  equivalents,
} from "./operations-input";
type Tx = Prisma.TransactionClient;
export async function financeActor(
  tx: Tx,
  permission: string,
  marketId?: string,
) {
  const id = (await auth())?.user?.id;
  if (!id) throw new UnauthorizedError();
  const user = await tx.user.findUnique({
    where: { id },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!evaluateAccess(user, permission, marketId ? { marketId } : {}))
    throw new ForbiddenError(permission);
  return id;
}
function invalid(): never {
  throw new z.ZodError([]);
}
async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
}
async function audit(
  tx: Tx,
  userId: string,
  action: string,
  id: string,
  after: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: { userId, action, entityType: "Finance", entityId: id, after },
  });
}
export async function saveFinanceConfig(raw: unknown) {
  const v = z
    .object({
      marketId: identifier,
      enabled: z.boolean(),
      marginPercent: z
        .string()
        .refine((v) => new Exact(v).gte(0) && new Exact(v).lte(100)),
      slowDays: z.number().int().min(1).max(3650),
      deviationPercent: z
        .string()
        .refine((v) => new Exact(v).gte(0) && new Exact(v).lte(1000)),
      confirm: z.literal(true),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(tx, "finance.journal.post", v.marketId);
      await lock(tx, `finance:${v.marketId}`);
      const old = await tx.financeConfig.findUnique({
        where: { id: v.marketId },
      });
      const data = {
        enabled: v.enabled,
        enabledAt: v.enabled ? (old?.enabledAt ?? new Date()) : old?.enabledAt,
        marginPercent: v.marginPercent,
        slowDays: v.slowDays,
        deviationPercent: v.deviationPercent,
      };
      const row = await tx.financeConfig.upsert({
        where: { id: v.marketId },
        create: { id: v.marketId, ...data },
        update: data,
      });
      await audit(tx, actor, "finance.configure", v.marketId, {
        enabled: v.enabled,
      });
      return row.id;
    }),
  );
}
export async function createSupplier(raw: unknown) {
  const v = z
    .object({
      marketId: identifier,
      requestKey: identifier.optional(),
      name: z.string().trim().min(1).max(150),
      notes: z.string().max(2000).default(""),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(tx, "finance.journal.post", v.marketId);
      const hash = journalHash({ actor, ...v });
      if (v.requestKey) {
        await lock(tx, `supplier:${v.marketId}:${v.requestKey}`);
        const prior = await tx.supplier.findUnique({
          where: {
            marketId_requestKey: {
              marketId: v.marketId,
              requestKey: v.requestKey,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash) invalid();
          return prior.id;
        }
      }
      const row = await tx.supplier.create({
        data: { ...v, requestHash: hash },
      });
      await audit(tx, actor, "finance.supplier", row.id, {
        marketId: v.marketId,
      });
      return row.id;
    }),
  );
}
export async function createPurchase(raw: unknown) {
  const v = purchaseInput.parse(raw);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        const actor = await financeActor(
          tx,
          "finance.journal.post",
          v.marketId,
        );
        await lock(tx, `purchase:${v.marketId}:${v.requestKey}`);
        const hash = journalHash({ actor, ...v });
        const prior = await tx.purchaseOrder.findUnique({
          where: {
            marketId_requestKey: {
              marketId: v.marketId,
              requestKey: v.requestKey,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash) invalid();
          return prior.id;
        }
        if (
          !(await tx.supplier.findFirst({
            where: { id: v.supplierId, marketId: v.marketId, isActive: true },
          }))
        )
          invalid();
        if (!(await tx.warehouse.findUnique({ where: { id: v.warehouseId } })))
          invalid();
        const variants = await tx.variant.findMany({
          where: {
            id: { in: v.items.map((i) => i.variantId) },
            product: {
              deletedAt: null,
              OR: [
                { marketIds: { isEmpty: true } },
                { marketIds: { has: v.marketId } },
              ],
            },
          },
        });
        if (variants.length !== v.items.length) invalid();
        const costs = allocateLandedCost({
          additionalCost: v.additionalCost,
          items: v.items.map((i) => ({
            id: i.variantId,
            quantity: i.quantity,
            purchaseTotal: i.purchaseTotal,
            allocationWeight:
              v.allocation === "VALUE" ? i.purchaseTotal : i.weight,
          })),
        });
        const row = await tx.purchaseOrder.create({
          data: {
            marketId: v.marketId,
            requestKey: v.requestKey,
            requestHash: hash,
            supplierId: v.supplierId,
            warehouseId: v.warehouseId,
            memo: v.memo,
            ...v.snapshot,
            effectiveAt: new Date(v.snapshot.effectiveAt),
            fxAsOf: new Date(v.snapshot.fxAsOf),
            additionalCost: v.additionalCost,
            allocation: v.allocation,
            createdById: actor,
            items: {
              create: v.items.map((i) => {
                const c = costs.find((c) => c.id === i.variantId)!;
                equivalents(c.landedTotal, v.snapshot);
                return {
                  ...i,
                  allocatedCost: c.allocatedCost,
                  landedTotal: c.landedTotal,
                  unitCost: c.unitCost,
                  roundingRemainder: c.roundingRemainder,
                };
              }),
            },
          },
        });
        await audit(tx, actor, "finance.purchase.create", row.id, {
          marketId: v.marketId,
        });
        return row.id;
      },
      { timeout: 30000 },
    ),
  );
}
export async function receivePurchase(raw: unknown) {
  const v = z
    .object({ id: identifier, confirm: z.literal(true) })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        const subject = await tx.purchaseOrder.findUnique({
          where: { id: v.id },
          select: { marketId: true },
        });
        if (!subject) throw new ForbiddenError("finance.journal.post");
        const actor = await financeActor(
          tx,
          "finance.journal.post",
          subject.marketId,
        );
        await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id=${v.id} FOR UPDATE`;
        const row = await tx.purchaseOrder.findUniqueOrThrow({
          where: { id: v.id },
          include: { items: true },
        });
        if (row.status === "RECEIVED") return row.id;
        if (row.status !== "DRAFT") invalid();
        const rates = {
          currency: row.currency as "TRY" | "USD" | "CAD" | "IRT",
          rateTry: row.rateTry.toFixed(12),
          rateUsd: row.rateUsd.toFixed(12),
          fxAsOf: row.fxAsOf.toISOString(),
          effectiveAt: row.effectiveAt.toISOString(),
        };
        for (const item of [...row.items].sort((a, b) =>
          a.variantId.localeCompare(b.variantId),
        )) {
          const eq = equivalents(item.unitCost.toFixed(4), rates);
          const result = await receiveStockInTransaction(tx, {
            warehouseId: row.warehouseId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitCostAmount: item.unitCost.toFixed(4),
            totalCostAmount: item.landedTotal.toFixed(4),
            unitCostCurrency: rates.currency,
            unitCostAmountTry: eq.amountTry,
            unitCostAmountUsd: eq.amountUsd,
            fxRateSnapshot: rates,
            receivedAt: row.effectiveAt,
            createdBy: actor,
            reason: `purchase:${row.id}`,
          });
          await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: { lotId: result.lot.id },
          });
          await tx.lot.update({
            where: { id: result.lot.id },
            data: { landedCostAmount: item.allocatedCost },
          });
          await postPair(tx, {
            marketId: row.marketId,
            key: `purchase:${row.id}:${item.id}`,
            memo: row.memo,
            amount: item.landedTotal.toFixed(4),
            debit: "inventory",
            credit: "payables",
            rates,
            actor,
          });
        }
        const amount = row.items
          .reduce((n, i) => n.add(i.landedTotal.toString()), new Exact(0))
          .toFixed(4);
        await tx.purchaseOrder.update({
          where: { id: row.id },
          data: { status: "RECEIVED", receivedAt: new Date() },
        });
        await audit(tx, actor, "finance.purchase.receive", row.id, {
          amount,
          currency: row.currency,
        });
        return row.id;
      },
      { timeout: 30000 },
    ),
  );
}
export async function createExpense(raw: unknown) {
  const v = expenseInput.parse(raw);
  if (v.recurringSourceId) v.requestKey = `recurring:${v.recurringSourceId}`;
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(
        tx,
        "finance.expense.create",
        v.marketId,
      );
      if (v.isGlobal) await financeActor(tx, "finance.expense.create");
      await lock(tx, `expense:${v.marketId}:${v.requestKey}`);
      const hash = journalHash({ actor, ...v });
      const old = await tx.expense.findUnique({
        where: {
          marketId_requestKey: {
            marketId: v.marketId,
            requestKey: v.requestKey,
          },
        },
      });
      if (old) {
        if (old.requestHash !== hash) invalid();
        return old.id;
      }
      if (v.recurringSourceId) {
        const source = await tx.expense.findFirst({
          where: {
            id: v.recurringSourceId,
            marketId: v.marketId,
            status: "APPROVED",
            recurrenceMonths: { gt: 0 },
          },
        });
        if (source?.isGlobal) await financeActor(tx, "finance.expense.create");
        if (
          !source ||
          source.isGlobal !== v.isGlobal ||
          nextExpenseDate(source.effectiveAt, source.recurrenceMonths)
            .toISOString()
            .slice(0, 10) !== v.snapshot.effectiveAt.slice(0, 10)
        )
          invalid();
      }
      equivalents(v.amount, v.snapshot);
      // Only privately uploaded expense documents owned by this actor can be attached.
      if (
        v.attachmentId &&
        !(await tx.media.findFirst({
          where: {
            id: v.attachmentId,
            kind: "expense",
            tags: { has: `expense-market:${v.marketId}` },
            uploadedBy: actor,
            status: "READY",
            deletedAt: null,
          },
        }))
      )
        invalid();
      const row = await tx.expense.create({
        data: {
          marketId: v.marketId,
          requestKey: v.requestKey,
          requestHash: hash,
          category: v.category,
          memo: v.memo,
          amount: v.amount,
          attachmentId: v.attachmentId,
          recurrenceMonths: v.recurrenceMonths,
          recurringSourceId: v.recurringSourceId,
          isGlobal: v.isGlobal,
          ...v.snapshot,
          effectiveAt: new Date(v.snapshot.effectiveAt),
          fxAsOf: new Date(v.snapshot.fxAsOf),
          createdById: actor,
        },
      });
      await audit(tx, actor, "finance.expense.create", row.id, {
        marketId: v.marketId,
      });
      return row.id;
    }),
  );
}
export async function approveExpense(raw: unknown) {
  const v = z
    .object({ id: identifier, confirm: z.literal(true) })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const subject = await tx.expense.findUnique({
        where: { id: v.id },
        select: { marketId: true },
      });
      if (!subject) throw new ForbiddenError("finance.journal.post");
      const actor = await financeActor(
        tx,
        "finance.journal.post",
        subject.marketId,
      );
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id=${v.id} FOR UPDATE`;
      const row = await tx.expense.findUniqueOrThrow({ where: { id: v.id } });
      if (row.isGlobal) await financeActor(tx, "finance.journal.post");
      if (row.status === "APPROVED") return row.id;
      if (row.status !== "PENDING") invalid();
      const expenseCode = `expense_${journalHash({ category: row.category }).slice(0, 20)}`;
      await tx.ledgerAccount.upsert({
        where: {
          marketId_currency_code: {
            marketId: row.marketId,
            currency: row.currency,
            code: expenseCode,
          },
        },
        create: {
          marketId: row.marketId,
          currency: row.currency,
          code: expenseCode,
          kind: "EXPENSE",
          nameI18n: { fa: row.category, tr: row.category, en: row.category },
        },
        update: {},
      });
      const entry = await postPair(tx, {
        marketId: row.marketId,
        key: `expense:${row.id}`,
        memo: row.memo,
        amount: row.amount.toFixed(4),
        debit: expenseCode,
        credit: "bank",
        actor,
        rates: {
          currency: row.currency as "TRY" | "USD" | "CAD" | "IRT",
          rateTry: row.rateTry.toFixed(12),
          rateUsd: row.rateUsd.toFixed(12),
          fxAsOf: row.fxAsOf.toISOString(),
          effectiveAt: row.effectiveAt.toISOString(),
        },
      });
      await tx.expense.update({
        where: { id: row.id },
        data: { status: "APPROVED", approvedById: actor, journalId: entry!.id },
      });
      await audit(tx, actor, "finance.expense.approve", row.id, {
        journalId: entry!.id,
      });
      return row.id;
    }),
  );
}
export async function createPartner(raw: unknown) {
  const v = z
    .object({
      marketId: identifier,
      requestKey: identifier.optional(),
      name: z.string().trim().min(1).max(150),
      ownershipPercent: positive.refine((v) => new Exact(v).lte(100)),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(tx, "finance.journal.post", v.marketId);
      await lock(tx, `partners:${v.marketId}`);
      const hash = journalHash({ actor, ...v });
      if (v.requestKey) {
        const prior = await tx.partner.findUnique({
          where: {
            marketId_requestKey: {
              marketId: v.marketId,
              requestKey: v.requestKey,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash) invalid();
          return prior.id;
        }
      }
      const total = await tx.partner.aggregate({
        where: { marketId: v.marketId, isActive: true },
        _sum: { ownershipPercent: true },
      });
      if (
        new Exact(total._sum.ownershipPercent?.toString() ?? "0")
          .add(v.ownershipPercent)
          .gt(100)
      )
        invalid();
      const row = await tx.partner.create({
        data: { ...v, requestHash: hash },
      });
      await audit(tx, actor, "finance.partner.create", row.id, {
        marketId: v.marketId,
      });
      return row.id;
    }),
  );
}
export async function createCapital(raw: unknown) {
  const v = capitalInput.parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(tx, "finance.journal.post", v.marketId);
      await lock(tx, `capital:${v.marketId}:${v.requestKey}`);
      const hash = journalHash({ actor, ...v });
      const old = await tx.capitalTransaction.findUnique({
        where: {
          marketId_requestKey: {
            marketId: v.marketId,
            requestKey: v.requestKey,
          },
        },
      });
      if (old) {
        if (old.requestHash !== hash) invalid();
        return old.id;
      }
      if (
        !(await tx.partner.findFirst({
          where: { id: v.partnerId, marketId: v.marketId, isActive: true },
        }))
      )
        invalid();
      if (
        v.purchaseOrderId &&
        !(await tx.purchaseOrder.findFirst({
          where: { id: v.purchaseOrderId, marketId: v.marketId },
        }))
      )
        invalid();
      const entry = await postPair(tx, {
        marketId: v.marketId,
        key: `capital:${v.requestKey}`,
        memo: v.memo,
        amount: v.amount,
        rates: v.snapshot,
        actor,
        debit: v.kind === "CONTRIBUTION" ? "bank" : "partner_draws",
        credit: v.kind === "CONTRIBUTION" ? "partner_capital" : "bank",
      });
      const row = await tx.capitalTransaction.create({
        data: {
          marketId: v.marketId,
          requestKey: v.requestKey,
          requestHash: hash,
          partnerId: v.partnerId,
          kind: v.kind,
          memo: v.memo,
          amount: v.amount,
          purchaseOrderId: v.purchaseOrderId,
          journalId: entry!.id,
          createdById: actor,
          ...v.snapshot,
          effectiveAt: new Date(v.snapshot.effectiveAt),
          fxAsOf: new Date(v.snapshot.fxAsOf),
        },
      });
      await audit(tx, actor, "finance.capital.create", row.id, {
        journalId: entry!.id,
      });
      return row.id;
    }),
  );
}

export async function refreshFinancialAlerts(raw: unknown) {
  const v = z
    .object({ marketId: identifier, confirm: z.literal(true) })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        const actor = await financeActor(
          tx,
          "finance.journal.post",
          v.marketId,
        );
        const config = await tx.financeConfig.findUnique({
          where: { id: v.marketId },
        });
        await scanStockAlerts(
          tx,
          v.marketId,
          config?.slowDays ?? 90,
          config?.deviationPercent.toString() ?? "50",
        );
        await audit(tx, actor, "finance.alerts.scan", v.marketId, {});
        return v.marketId;
      },
      { timeout: 30000 },
    ),
  );
}

/** Assign explicit opening cost evidence to existing, un-lotted units only. */
export async function openDefaultCosts(raw: unknown) {
  const v = z
    .object({
      marketId: identifier,
      warehouseId: identifier,
      requestKey: identifier,
      memo: z.string().trim().min(1).max(500),
      snapshot,
      confirm: z.literal(true),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        const actor = await financeActor(
          tx,
          "finance.journal.post",
          v.marketId,
        );
        const hash = journalHash({ actor, ...v }),
          key = `opening:${v.marketId}:${v.requestKey}`;
        await lock(tx, key);
        const prior = await tx.auditLog.findFirst({
          where: { entityType: "FinanceOpening", entityId: key },
          select: { after: true },
        });
        if (prior) {
          const data = prior.after as { hash: string; id: string };
          if (data.hash !== hash) invalid();
          return data.id;
        }
        await tx.$queryRaw`SELECT id FROM "StockItem" WHERE "warehouseId"=${v.warehouseId} ORDER BY "variantId",id FOR UPDATE`;
        const stocks = await tx.stockItem.findMany({
          where: {
            warehouseId: v.warehouseId,
            onHand: { gt: 0 },
            variant: {
              product: {
                deletedAt: null,
                defaultPurchaseCostAmount: { gt: 0 },
                defaultPurchaseCostCurrency: v.snapshot.currency,
                OR: [
                  { marketIds: { isEmpty: true } },
                  { marketIds: { has: v.marketId } },
                ],
              },
            },
          },
          include: { variant: { include: { product: true } } },
        });
        let amount = new Exact(0);
        const lots: string[] = [];
        for (const stock of stocks) {
          const sum = await tx.lot.aggregate({
            where: {
              warehouseId: stock.warehouseId,
              variantId: stock.variantId,
            },
            _sum: { qtyRemaining: true },
          });
          const quantity = stock.onHand - (sum._sum.qtyRemaining ?? 0);
          if (quantity <= 0) continue;
          const unit =
              stock.variant.product.defaultPurchaseCostAmount!.toFixed(4),
            eq = equivalents(unit, v.snapshot);
          const lot = await tx.lot.create({
            data: {
              warehouseId: stock.warehouseId,
              variantId: stock.variantId,
              qtyReceived: quantity,
              qtyRemaining: quantity,
              unitCostAmount: unit,
              unitCostCurrency: v.snapshot.currency,
              unitCostAmountTry: eq.amountTry,
              unitCostAmountUsd: eq.amountUsd,
              fxRateSnapshot: v.snapshot,
              receivedAt: new Date(v.snapshot.effectiveAt),
            },
          });
          lots.push(lot.id);
          amount = amount.add(new Exact(unit).mul(quantity));
        }
        const entry = await postPair(tx, {
          marketId: v.marketId,
          key: `opening:${v.requestKey}`,
          memo: v.memo,
          amount: amount.toFixed(4),
          debit: "inventory",
          credit: "clearing",
          rates: v.snapshot,
          actor,
        });
        const id = entry?.id ?? v.requestKey;
        await tx.auditLog.create({
          data: {
            userId: actor,
            action: "finance.opening.cost",
            entityType: "FinanceOpening",
            entityId: key,
            after: {
              hash,
              id,
              lots,
              amount: amount.toFixed(4),
              marketId: v.marketId,
            },
          },
        });
        return id;
      },
      { timeout: 30000 },
    ),
  );
}

export async function configureCostMethod(raw: unknown) {
  const v = z
    .object({
      marketId: identifier,
      warehouseId: identifier,
      variantId: identifier,
      method: z.enum(["FIFO", "AVERAGE"]),
      confirm: z.literal(true),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        // Physical stock is shared across markets; only an unscoped accountant/owner can change its method.
        const actor = await financeActor(tx, "finance.journal.post");
        const variant = await tx.variant.findFirst({
          where: {
            id: v.variantId,
            product: {
              deletedAt: null,
              OR: [
                { marketIds: { isEmpty: true } },
                { marketIds: { has: v.marketId } },
              ],
            },
          },
        });
        if (!variant) invalid();
        const stock = await tx.stockItem.upsert({
          where: {
            warehouseId_variantId: {
              warehouseId: v.warehouseId,
              variantId: v.variantId,
            },
          },
          create: {
            warehouseId: v.warehouseId,
            variantId: v.variantId,
            onHand: 0,
          },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM "StockItem" WHERE id=${stock.id} FOR UPDATE`;
        const previous = await tx.stockCostPolicy.findUnique({
          where: { stockItemId: stock.id },
        });
        if (previous?.method === v.method) return stock.id;
        if (
          await tx.stockValuation.findFirst({
            where: { stockItemId: stock.id },
            select: { movementId: true },
          })
        )
          invalid();
        const posted = await tx.$queryRaw<
          { id: string }[]
        >`SELECT j.id FROM "JournalEntry" j JOIN "StockMovement" m ON j."requestKey"='cogs:'||m.id WHERE m."stockItemId"=${stock.id} LIMIT 1`;
        if (posted.length) invalid();
        if (v.method === "AVERAGE") {
          const value = await initializeAverage(tx, stock.id);
          if (value.quantity !== stock.onHand) invalid();
        } else
          await tx.stockValue.deleteMany({ where: { stockItemId: stock.id } });
        await tx.stockCostPolicy.upsert({
          where: { stockItemId: stock.id },
          create: { stockItemId: stock.id, method: v.method },
          update: { method: v.method },
        });
        await audit(tx, actor, "finance.cost.method", stock.id, {
          method: v.method,
        });
        return stock.id;
      },
      { timeout: 30000 },
    ),
  );
}
