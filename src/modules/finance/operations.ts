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
      name: z.string().trim().min(1).max(150),
      notes: z.string().max(2000).default(""),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(tx, "finance.journal.post", v.marketId);
      const row = await tx.supplier.create({ data: v });
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
        }
        const amount = row.items
          .reduce((n, i) => n.add(i.landedTotal.toString()), new Exact(0))
          .toFixed(4);
        await postPair(tx, {
          marketId: row.marketId,
          key: `purchase:${row.id}`,
          memo: row.memo,
          amount,
          debit: "inventory",
          credit: "payables",
          rates,
          actor,
        });
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
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(
        tx,
        "finance.expense.create",
        v.marketId,
      );
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
      if (row.status === "APPROVED") return row.id;
      if (row.status !== "PENDING") invalid();
      const entry = await postPair(tx, {
        marketId: row.marketId,
        key: `expense:${row.id}`,
        memo: row.memo,
        amount: row.amount.toFixed(4),
        debit: "expenses",
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
      name: z.string().trim().min(1).max(150),
      ownershipPercent: z
        .string()
        .refine((v) => new Exact(v).gt(0) && new Exact(v).lte(100)),
    })
    .strict()
    .parse(raw);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const actor = await financeActor(tx, "finance.journal.post", v.marketId);
      await lock(tx, `partners:${v.marketId}`);
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
      const row = await tx.partner.create({ data: v });
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
