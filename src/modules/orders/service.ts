import { queueInvoice } from "./invoices/queue";
import { Prisma, type OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { currentCustomer } from "@/modules/customers";
import { equalSecret, tokenHash } from "@/lib/secure-tokens";
import { assertCan, can } from "@/modules/access";
import {
  verifyOrderInventory,
  consumeOrderInventory,
  releaseOrderInventory,
} from "@/modules/inventory";
import { queueEmail } from "@/modules/notifications";
import { CommerceError, assertOrderTransition } from "./state";

export const orderInclude = {
  items: true,
  fees: true,
  events: { orderBy: { createdAt: "asc" as const } },
  payments: {
    include: { receipts: { include: { media: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  market: true,
} satisfies Prisma.OrderInclude;
export async function authorizedOrder(number: string) {
  const order = await db.order.findUnique({
    where: { number },
    include: orderInclude,
  });
  if (!order) throw new CommerceError("NOT_FOUND");
  const customer = await currentCustomer(),
    jar = await cookies();
  const token =
    jar.get(`hoda.order.${number}`)?.value ?? jar.get("hoda.cart")?.value;
  if (
    customer?.id !== order.customerId &&
    (!token || !equalSecret(tokenHash(token), order.guestTokenHash))
  )
    throw new CommerceError("NOT_FOUND");
  return order;
}
export async function adminOrder(
  number: string,
  userId: string,
  permission = "order.view",
) {
  const order = await db.order.findUnique({
    where: { number },
    include: orderInclude,
  });
  if (!order) throw new CommerceError("NOT_FOUND");
  await assertCan(userId, permission, { marketId: order.marketId });
  return order;
}
export async function visibleOrderMarkets(userId: string) {
  const markets = await db.market.findMany({ select: { id: true } }),
    ids: string[] = [];
  for (const market of markets)
    if (await can(userId, "order.view", { marketId: market.id }))
      ids.push(market.id);
  return ids;
}
export async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
  return tx.order.findUniqueOrThrow({
    where: { id },
    include: { items: true, payments: { orderBy: { createdAt: "desc" } } },
  });
}
export async function transition(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus },
  to: OrderStatus,
  userId?: string,
  note = "",
) {
  assertOrderTransition(order.status, to);
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: to,
      ...(to === "PAID" ? { paidAt: new Date() } : {}),
      ...(to === "CANCELLED"
        ? { cancelledAt: new Date(), cancelReason: note }
        : {}),
      ...(to === "SHIPPED" ? { shippedAt: new Date() } : {}),
      ...(to === "DELIVERED" ? { deliveredAt: new Date() } : {}),
    },
  });
  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      type: to,
      fromStatus: order.status,
      toStatus: to,
      note,
      userId,
    },
  });
  if (userId)
    await tx.auditLog.create({
      data: {
        userId,
        action: `order.${to.toLowerCase()}`,
        entityType: "Order",
        entityId: order.id,
        before: { status: order.status },
        after: { status: to },
      },
    });
}
export async function approvePayment(
  orderId: string,
  userId: string,
  cash = false,
) {
  const target = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await assertCan(
    userId,
    cash ? "payment.mark_paid" : "payment.receipt.approve",
    { marketId: target.marketId },
  );
  return db.$transaction(
    async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.paidAt) return order.status;
      if (
        !["PENDING_PAYMENT", "AWAITING_VERIFICATION", "NEEDS_REVIEW"].includes(
          order.status,
        )
      )
        throw new CommerceError("INVALID_TRANSITION");
      let payment = order.payments.find((p) => p.status === "SUBMITTED");
      if (!payment && !cash) throw new CommerceError("RECEIPT_REQUIRED");
      if (!payment && order.paymentDeadlineAt <= new Date()) throw new CommerceError("INVALID_TRANSITION");
      if (!(await verifyOrderInventory(tx, order.id, order.items))) {
        if (order.status !== "NEEDS_REVIEW")
          await transition(tx, order, "NEEDS_REVIEW", userId);
        await tx.systemAlert.create({
          data: {
            severity: "WARNING",
            code: `ORDER_STOCK_${order.number}`,
            message: "Payment review requires inventory resolution",
          },
        });
        return "NEEDS_REVIEW" as const;
      }
      await consumeOrderInventory(tx, order.id, userId);
      if (cash && !payment) {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: "PENDING" },
          data: { status: "VOIDED" },
        });
        payment = await tx.payment.create({
          data: {
            orderId: order.id,
            amount: order.totalAmount,
            currency: order.currency,
            method: "CASH",
            status: "PENDING",
          },
        });
      }
      await tx.payment.update({
        where: { id: payment!.id },
        data: {
          status: "APPROVED",
          reviewedBy: userId,
          reviewedAt: new Date(),
        },
      });
      await transition(tx, order, "PAID", userId);
      await queueInvoice(tx, order.id, userId);
      const contact = order.contactSnapshot as {
        email: string;
        firstName: string;
      };
      await queueEmail(
        tx,
        "order.paid",
        contact.email,
        order.locale as "fa" | "tr" | "en",
        {
          customerName: contact.firstName,
          orderNumber: order.number,
          total: `${order.totalAmount} ${order.currency}`,
        },
      );
      return "PAID" as const;
    },
    { timeout: 30000 },
  );
}
export async function rejectPayment(
  orderId: string,
  userId: string,
  reason: string,
) {
  if (!reason.trim()) throw new CommerceError("REASON_REQUIRED");
  const target = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await assertCan(userId, "payment.receipt.approve", {
    marketId: target.marketId,
  });
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId),
      payment = order.payments.find((p) => p.status === "SUBMITTED");
    if (
      !payment ||
      !["AWAITING_VERIFICATION", "NEEDS_REVIEW"].includes(order.status)
    )
      throw new CommerceError("INVALID_TRANSITION");
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        rejectReason: reason,
        reviewedAt: new Date(),
        reviewedBy: userId,
      },
    });
    await releaseOrderInventory(tx, order.id);
    await transition(tx, order, "PENDING_PAYMENT", userId, reason);
    const contact = order.contactSnapshot as {
      email: string;
      firstName: string;
    };
    await queueEmail(
      tx,
      "order.rejected",
      contact.email,
      order.locale as "fa" | "tr" | "en",
      { customerName: contact.firstName, orderNumber: order.number, reason },
    );
  });
}
export async function cancelOrder(
  orderId: string,
  reason: string,
  userId?: string,
  now = new Date(),
) {
  const target = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (userId)
    await assertCan(userId, "order.cancel", { marketId: target.marketId });
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status === "CANCELLED") return;
    if (
      !userId &&
      (order.status !== "PENDING_PAYMENT" ||
        order.paymentDeadlineAt > now ||
        order.payments.some((p) =>
          ["SUBMITTED", "APPROVED"].includes(p.status),
        ))
    )
      return;
    await releaseOrderInventory(tx, order.id);
    await tx.payment.updateMany({
      where: { orderId, status: { in: ["PENDING", "SUBMITTED"] } },
      data: { status: "VOIDED" },
    });
    await transition(tx, order, "CANCELLED", userId, reason);
    const contact = order.contactSnapshot as {
      email: string;
      firstName: string;
    };
    await queueEmail(
      tx,
      "order.cancelled",
      contact.email,
      order.locale as "fa" | "tr" | "en",
      { customerName: contact.firstName, orderNumber: order.number, reason },
    );
  });
}
export async function cancelUnpaidOrders(now = new Date()) {
  const rows = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentDeadlineAt: { lte: now } },
    select: { id: true },
    take: 100,
    orderBy: { paymentDeadlineAt: "asc" },
  });
  for (const row of rows)
    await cancelOrder(row.id, "payment_deadline", undefined, now);
  return rows.length;
}
export async function extendOrderHold(
  orderId: string,
  userId: string,
  hours: number,
) {
  const target = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await assertCan(userId, "order.edit", { marketId: target.marketId });
  if (!Number.isInteger(hours) || hours < 1 || hours > 168)
    throw new CommerceError("INVALID_QUANTITY");
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (
      order.status !== "PENDING_PAYMENT" ||
      order.paymentDeadlineAt <= new Date()
    )
      throw new CommerceError("INVALID_TRANSITION");
    if (!(await verifyOrderInventory(tx, order.id, order.items)))
      throw new CommerceError("STOCK_UNAVAILABLE");
    const expiresAt = new Date(
      Math.min(Date.now() + hours * 3600000, order.paymentDeadlineAt.getTime()),
    );
    await tx.reservation.updateMany({
      where: { orderId, status: "ACTIVE" },
      data: { kind: "HOLD", expiresAt },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { holdExpiresAt: expiresAt },
    });
    await tx.orderEvent.create({
      data: {
        orderId,
        type: "hold_extended",
        userId,
        note: expiresAt.toISOString(),
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: "order.hold_extended",
        entityType: "Order",
        entityId: orderId,
        after: { expiresAt: expiresAt.toISOString() },
      },
    });
  });
}
