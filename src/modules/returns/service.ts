import { exchangeReturn } from "./exchange";
import Decimal from "decimal.js";
import { Prisma, type ReturnStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { can, assertCan, ForbiddenError } from "@/modules/access";
import { CommerceError } from "@/modules/orders/state";
import {
  returnPolicySchema,
  returnRequestSchema,
  returnOperationSchema,
  returnLineBudgets,
  returnAmount,
} from "./validation";
const include = {
  items: { include: { orderItem: true } },
  order: true,
} satisfies Prisma.ReturnRequestInclude;
export async function returnMarkets(
  userId: string,
  permission = "return.manage",
) {
  const markets = await db.market.findMany({ select: { id: true } });
  const ids: string[] = [];
  for (const m of markets)
    if (await can(userId, permission, { marketId: m.id })) ids.push(m.id);
  return ids;
}
export async function requestReturn(customerId: string, raw: unknown) {
  const input = returnRequestSchema.parse(raw);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        // Customer scope is in the first query; no order data is read for another customer.
        const subject = await tx.order.findFirst({
          where: {
            id: input.orderId,
            customerId,
            customer: { isActive: true },
          },
          select: { id: true },
        });
        if (!subject) throw new CommerceError("NOT_FOUND");
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${subject.id} FOR UPDATE`;
        const previous = await tx.returnRequest.findUnique({
          where: {
            orderId_requestKey: {
              orderId: subject.id,
              requestKey: input.requestKey,
            },
          },
        });
        if (previous) return previous;
        const order = await tx.order.findUniqueOrThrow({
          where: { id: subject.id },
          include: {
            market: true,
            items: { include: { variant: { include: { product: true } } } },
          },
        });
        const policy = returnPolicySchema.parse(order.market.returnSettings);
        if (
          order.status !== "DELIVERED" ||
          !order.paidAt ||
          !order.deliveredAt ||
          !policy.enabled ||
          Date.now() > order.deliveredAt.getTime() + policy.days * 86400000
        )
          throw new CommerceError("RETURN_INELIGIBLE");
        const budgets = returnLineBudgets(
          order.items,
          order.discountAmount.toString(),
        );
        const created: Prisma.ReturnItemUncheckedCreateWithoutReturnRequestInput[] =
          [];
        for (const i of input.items) {
          const original = order.items.find((o) => o.id === i.orderItemId);
          if (
            !original ||
            policy.excludedCategoryIds.includes(
              original.variant.product.categoryId,
            )
          )
            throw new CommerceError("RETURN_INELIGIBLE");
          const reserved = await tx.returnItem.aggregate({
            where: {
              orderItemId: original.id,
              returnRequest: { status: { not: "REJECTED" } },
            },
            _sum: { quantity: true, refundAmount: true },
          });
          let amount: Decimal;
          try {
            amount = returnAmount(
              budgets.get(original.id)!,
              original.quantity,
              reserved._sum.quantity ?? 0,
              reserved._sum.refundAmount?.toString() ?? "0",
              i.quantity,
            );
          } catch {
            throw new CommerceError("RETURN_QUANTITY");
          }
          if (i.exchangeVariantId) {
            const replacement = await tx.variant.findFirst({
              where: {
                id: i.exchangeVariantId,
                productId: original.variant.productId,
                isActive: true,
                product: {
                  status: "ACTIVE",
                  deletedAt: null,
                  OR: [
                    { marketIds: { isEmpty: true } },
                    { marketIds: { has: order.marketId } },
                  ],
                },
              },
            });
            if (!replacement || replacement.id === original.variantId)
              throw new CommerceError("RETURN_VARIANT");
          }
          created.push({
            orderItemId: original.id,
            quantity: i.quantity,
            condition: "QUARANTINE",
            exchangeVariantId: i.exchangeVariantId,
            refundAmount: amount.toFixed(),
          });
        }
        const amount = created.reduce(
          (n, i) => n.add(String(i.refundAmount)),
          new Decimal(0),
        );
        const row = await tx.returnRequest.create({
          data: {
            orderId: order.id,
            customerId,
            type: input.type,
            reasonCode: input.reasonCode,
            note: input.note,
            requestKey: input.requestKey,
            policySnapshot: policy,
            refundAmount: amount.toFixed(),
            items: { create: created },
          },
        });
        await tx.orderEvent.create({
          data: { orderId: order.id, type: "return.requested", note: row.id },
        });
        await tx.auditLog.create({
          data: {
            action: "return.requested",
            entityType: "ReturnRequest",
            entityId: row.id,
            after: {
              customerId,
              quantity: created.reduce((n, i) => n + i.quantity, 0),
            },
          },
        });
        return row;
      },
      { timeout: 30000 },
    ),
  );
}
async function receiveItems(
  tx: Prisma.TransactionClient,
  row: Prisma.ReturnRequestGetPayload<{ include: typeof include }>,
  conditions: {
    itemId: string;
    condition: "RESTOCK" | "QUARANTINE" | "DAMAGED";
  }[],
  userId: string,
) {
  if (
    conditions.length !== row.items.length ||
    new Set(conditions.map((i) => i.itemId)).size !== row.items.length ||
    conditions.some((c) => !row.items.some((i) => i.id === c.itemId))
  )
    throw new CommerceError("VALIDATION");
  const variants = [
    ...new Set(row.items.map((i) => i.orderItem.variantId)),
  ].sort();
  await tx.$queryRaw`SELECT id FROM "StockItem" WHERE "variantId" IN (${Prisma.join(variants)}) ORDER BY "variantId","warehouseId",id FOR UPDATE`;
  const history = await tx.returnItem.findMany({
    where: { orderItem: { orderId: row.orderId } },
    select: { id: true },
  });
  for (const item of row.items) {
    const condition = conditions.find((c) => c.itemId === item.id)!.condition;
    const outbound = await tx.stockMovement.findMany({
      where: {
        referenceId: row.orderId,
        variantId: item.orderItem.variantId,
        type: "OUT",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    let needed = item.quantity;
    for (const source of outbound) {
      if (!needed) break;
      if (!source.lotId) throw new CommerceError("RETURN_STOCK_HISTORY");
      const prior = await tx.stockMovement.aggregate({
        where: {
          referenceId: { in: history.map((i) => i.id) },
          lotId: source.lotId,
          stockItemId: source.stockItemId,
          type: {
            in: ["RETURN_RESTOCK", "RETURN_QUARANTINE", "RETURN_DAMAGED"],
          },
        },
        _sum: { quantity: true },
      });
      // All original OUT rows for this lot form a shared returned-quantity budget.
      const sold = outbound
        .filter(
          (o) =>
            o.lotId === source.lotId && o.stockItemId === source.stockItemId,
        )
        .reduce((n, o) => n - o.quantity, 0);
      const quantity = Math.min(needed, sold - (prior._sum.quantity ?? 0));
      if (quantity <= 0) continue;
      if (condition === "RESTOCK") {
        await tx.stockItem.update({
          where: { id: source.stockItemId },
          data: { onHand: { increment: quantity } },
        });
        await tx.lot.update({
          where: { id: source.lotId },
          data: { qtyRemaining: { increment: quantity } },
        });
      }
      await tx.stockMovement.create({
        data: {
          stockItemId: source.stockItemId,
          warehouseId: source.warehouseId,
          variantId: source.variantId,
          lotId: source.lotId,
          type: `RETURN_${condition}`,
          quantity,
          referenceId: item.id,
          reason: "customer_return",
          createdBy: userId,
        },
      });
      needed -= quantity;
    }
    if (needed) throw new CommerceError("RETURN_STOCK_HISTORY");
    await tx.returnItem.update({ where: { id: item.id }, data: { condition } });
  }
}
export async function manageReturn(userId: string, raw: unknown) {
  const input = returnOperationSchema.parse(raw);
  const markets = await returnMarkets(userId);
  const subject = await db.returnRequest.findFirst({
    where: { id: input.returnId, order: { marketId: { in: markets } } },
    select: { orderId: true, order: { select: { marketId: true } } },
  });
  if (!subject) throw new ForbiddenError("return.manage");
  const settlement = ["REFUND", "CREDIT", "EXCHANGE"].includes(input.operation);
  if (settlement)
    await assertCan(userId, "payment.refund", {
      marketId: subject.order.marketId,
    });
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${subject.orderId} FOR UPDATE`;
        await assertCan(userId, "return.manage", {
          marketId: subject.order.marketId,
        });
        if (settlement)
          await assertCan(userId, "payment.refund", {
            marketId: subject.order.marketId,
          });
        const row = await tx.returnRequest.findUniqueOrThrow({
          where: { id: input.returnId },
          include,
        });
        if (row.version !== input.version)
          throw new CommerceError("RETURN_STALE");
        const allowed: Record<string, ReturnStatus[]> = {
          APPROVE: ["REQUESTED"],
          REJECT: ["REQUESTED"],
          IN_TRANSIT: ["APPROVED"],
          RECEIVE: ["APPROVED", "IN_TRANSIT"],
          REFUND: ["RECEIVED"],
          CREDIT: ["RECEIVED"],
          EXCHANGE: ["RECEIVED"],
        };
        if (!allowed[input.operation].includes(row.status))
          throw new CommerceError("INVALID_TRANSITION");
        if (
          (input.operation === "REJECT" || input.operation === "REFUND") &&
          !input.note
        )
          throw new CommerceError("REASON_REQUIRED");
        const data: Prisma.ReturnRequestUpdateInput = {
          version: { increment: 1 },
          decisionNote: input.note,
        };
        if (input.operation === "APPROVE") data.status = "APPROVED";
        if (input.operation === "REJECT") data.status = "REJECTED";
        if (input.operation === "IN_TRANSIT") data.status = "IN_TRANSIT";
        if (input.operation === "RECEIVE") {
          await receiveItems(tx, row, input.conditions, userId);
          data.status = "RECEIVED";
          data.receivedAt = new Date();
        }
        if (input.operation === "REFUND" || input.operation === "CREDIT") {
          if (row.type !== "RETURN")
            throw new CommerceError("INVALID_TRANSITION");
          if (input.operation === "REFUND") {
            const payments = await tx.payment.findMany({
              where: { orderId: row.orderId, status: "APPROVED" },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            });
            // Split manual refunds by original payment; never label store credit as a bank transfer.
            let amount = new Decimal(row.refundAmount.toString());
            for (const p of payments) {
              if (amount.isZero()) break;
              const refunded = await tx.refund.aggregate({
                where: { paymentId: p.id, status: { not: "VOIDED" } },
                _sum: { amount: true },
              });
              const take = Decimal.min(
                amount,
                new Decimal(p.amount.toString()).sub(
                  refunded._sum.amount?.toString() ?? "0",
                ),
              );
              if (take.lte(0)) continue;
              const refund = await tx.refund.create({
                data: {
                  orderId: row.orderId,
                  paymentId: p.id,
                  returnRequestId: row.id,
                  amount: take.toFixed(),
                  currency: p.currency,
                  method: p.method,
                  reason: input.note,
                  status: "COMPLETED",
                  createdBy: userId,
                },
              });
              if (p.method === "STORE_CREDIT") {
                await tx.storeCredit.create({
                  data: {
                    customerId: row.customerId,
                    amount: take.toFixed(),
                    balance: take.toFixed(),
                    currency: row.order.currency,
                    sourceReturnId: row.id,
                  },
                });
              }
              if (!data.refundId) data.refundId = refund.id;
              amount = amount.sub(take);
            }
            if (!amount.isZero())
              throw new CommerceError("RETURN_PAYMENT_HISTORY");
          } else {
            await tx.storeCredit.create({
              data: {
                customerId: row.customerId,
                amount: row.refundAmount,
                currency: row.order.currency,
                balance: row.refundAmount,
                sourceReturnId: row.id,
              },
            });
          }
          data.status = "RESOLVED";
          data.resolution =
            input.operation === "REFUND" ? "REFUND" : "STORE_CREDIT";
          data.resolvedAt = new Date();
        }
        if (input.operation === "EXCHANGE") {
          const exchange = await exchangeReturn(tx, row.id, userId);
          data.exchangeOrderId = exchange.id;
          data.resolution = "EXCHANGE";
          data.status = "RESOLVED";
          data.resolvedAt = new Date();
        }
        const updated = await tx.returnRequest.update({
          where: { id: row.id },
          data,
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: `return.${input.operation.toLowerCase()}`,
            entityType: "ReturnRequest",
            entityId: row.id,
            before: { status: row.status, version: row.version },
            after: {
              status: updated.status,
              version: updated.version,
              refundAmount: row.refundAmount.toString(),
            },
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: row.orderId,
            type: `return.${input.operation.toLowerCase()}`,
            userId,
            note: row.id,
          },
        });
        return updated;
      },
      { timeout: 30000 },
    ),
  );
}
