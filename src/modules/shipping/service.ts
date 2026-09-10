import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, ForbiddenError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { queueEmail } from "@/modules/notifications";
import { transition } from "@/modules/orders/service";
import { shippingMarkets } from "./workflows";
import {
  ShippingError,
  itemsSchema,
  templateSchema,
  legUpdateSchema,
  assertAllocation,
  assertLegTransition,
  shipmentStatus,
  allItemsDelivered,
} from "./validation";
export const shipmentInclude = {
  items: true,
  legs: {
    orderBy: { sortOrder: "asc" as const },
    include: { events: { orderBy: { at: "asc" as const } } },
  },
} satisfies Prisma.ShipmentInclude;
export async function shippingOrder(
  userId: string,
  id: string,
  permission = "order.shipment.manage",
) {
  const markets = await shippingMarkets(userId, permission);
  const order = await db.order.findFirst({
    where: { id, marketId: { in: markets.map((m) => m.id) } },
  });
  if (!order) throw new ForbiddenError(permission);
  await assertCan(userId, permission, { marketId: order.marketId });
  return order;
}
async function audit(
  tx: Prisma.TransactionClient,
  userId: string,
  orderId: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await tx.auditLog.create({
    data: {
      userId,
      action: `shipping.${action}`,
      entityType: "Shipment",
      entityId,
      before: before ? JSON.parse(JSON.stringify(before)) : undefined,
      after: JSON.parse(JSON.stringify(after)),
    },
  });
  await tx.orderEvent.create({
    data: { orderId, type: `shipping.${action}`, userId },
  });
}
async function lockedOrder(
  tx: Prisma.TransactionClient,
  userId: string,
  orderId: string,
) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  await assertCan(userId, "order.shipment.manage", {
    marketId: order.marketId,
  });
  if (
    !order.paidAt ||
    !["PAID", "PROCESSING", "SHIPPED"].includes(order.status)
  )
    throw new ShippingError("SHIPPING_STATE");
  return order;
}
export async function createShipment(
  userId: string,
  orderId: string,
  rawItems: unknown,
  workflowId?: string,
) {
  await shippingOrder(userId, orderId);
  const items = itemsSchema.parse(rawItems);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const order = await lockedOrder(tx, userId, orderId);
      // Serialize workflow snapshot reads with the editor's market lock.
      await tx.$queryRaw`SELECT id FROM "Market" WHERE id=${order.marketId} FOR UPDATE`;
      const workflow = await tx.shippingWorkflow.findFirst({
        where: {
          marketId: order.marketId,
          isActive: true,
          ...(workflowId ? { id: workflowId } : { isDefault: true }),
        },
        include: { legs: { orderBy: { sortOrder: "asc" } } },
      });
      if (!workflow?.legs.length) throw new ShippingError("SHIPPING_WORKFLOW");
      const allocated = await tx.shipmentItem.findMany({
        where: { shipment: { orderId, status: { not: "CANCELLED" } } },
      });
      assertAllocation(order.items, allocated, items);
      const shipment = await tx.shipment.create({
        data: {
          orderId,
          workflowId: workflow.id,
          nameI18n: workflow.nameI18n as Prisma.InputJsonValue,
          items: { create: items },
          legs: {
            create: workflow.legs.map((l) => ({
              sortOrder: l.sortOrder,
              type: l.type,
              labelI18n: l.labelI18n as Prisma.InputJsonValue,
              carrierName: l.carrierName,
              trackingUrlTemplate: l.trackingUrlTemplate,
              costCurrency: order.currency,
            })),
          },
        },
        include: shipmentInclude,
      });
      if (order.status === "PAID")
        await transition(tx, order, "PROCESSING", userId);
      await audit(tx, userId, orderId, "created", shipment.id, null, {
        items,
        workflowId: workflow.id,
      });
      return shipment.id;
    }),
  );
}
export async function changeShipment(
  userId: string,
  orderId: string,
  shipmentId: string,
  version: number,
  operation: "saveLeg" | "addLeg" | "cancelLeg" | "cancelShipment" | "event",
  raw: Record<string, unknown>,
) {
  await shippingOrder(userId, orderId);
  z.number().int().min(0).parse(version);
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        const order = await lockedOrder(tx, userId, orderId);
        const shipment = await tx.shipment.findFirst({
          where: { id: shipmentId, orderId },
          include: shipmentInclude,
        });
        if (!shipment) throw new ForbiddenError("order.shipment.manage");
        if (shipment.version !== version)
          throw new ShippingError("SHIPPING_STALE");
        if (["DELIVERED", "CANCELLED"].includes(shipment.status))
          throw new ShippingError("SHIPPING_STATE");
        const leg = shipment.legs.find((l) => l.id === raw.legId);
        const now = new Date();
        if (operation === "addLeg") {
          const value = templateSchema.parse(raw);
          if (
            shipment.legs.filter((l) => l.status !== "CANCELLED").length >= 12
          )
            throw new ShippingError("SHIPPING_STATE");
          await tx.shipmentLeg.create({
            data: {
              ...value,
              labelI18n: value.labelI18n,
              shipmentId,
              sortOrder: Math.max(...shipment.legs.map((l) => l.sortOrder)) + 1,
              costCurrency: order.currency,
            },
          });
        } else if (operation === "cancelShipment") {
          if (shipment.legs.some((l) => l.shippedAt))
            throw new ShippingError("SHIPPING_STATE");
          await tx.shipmentLeg.updateMany({
            where: { shipmentId },
            data: { status: "CANCELLED" },
          });
        } else {
          if (!leg || leg.status === "CANCELLED")
            throw new ShippingError("SHIPPING_STATE");
          if (operation === "cancelLeg") {
            if (leg.shippedAt || leg.status !== "PENDING")
              throw new ShippingError("SHIPPING_STATE");
            if (
              shipment.legs.filter((l) => l.status !== "CANCELLED").length <= 1
            )
              throw new ShippingError("SHIPPING_LAST_LEG");
            await tx.shipmentLeg.update({
              where: { id: leg.id },
              data: { status: "CANCELLED" },
            });
          } else if (operation === "event") {
            const data = z
              .object({
                description: z.string().trim().min(1).max(1000),
                at: z.coerce.date(),
              })
              .parse(raw);
            if (data.at > now || data.at < order.placedAt)
              throw new ShippingError("SHIPPING_DATE");
            await tx.trackingEvent.create({
              data: { ...data, legId: leg.id, status: leg.status, userId },
            });
          } else {
            if (leg.status === "DELIVERED")
              throw new ShippingError("SHIPPING_STATE");
            const data = legUpdateSchema.parse(raw);
            assertLegTransition(leg.status, data.status);
            if (
              data.status === "IN_TRANSIT" &&
              shipment.legs.some(
                (l) =>
                  l.sortOrder < leg.sortOrder &&
                  !["DELIVERED", "CANCELLED"].includes(l.status),
              )
            )
              throw new ShippingError("SHIPPING_SEQUENCE");
            const shippedAt =
              leg.shippedAt ??
              (data.status === "IN_TRANSIT" ? (data.shippedAt ?? now) : null);
            const deliveredAt =
              leg.deliveredAt ??
              (data.status === "DELIVERED" ? (data.deliveredAt ?? now) : null);
            if (
              (data.shippedAt &&
                shippedAt?.getTime() !== data.shippedAt.getTime()) ||
              (data.deliveredAt &&
                deliveredAt?.getTime() !== data.deliveredAt.getTime())
            )
              throw new ShippingError("SHIPPING_DATE");
            const previous = shipment.legs
              .filter(
                (l) => l.sortOrder < leg.sortOrder && l.status !== "CANCELLED",
              )
              .at(-1);
            if (
              (shippedAt &&
                (shippedAt > now ||
                  shippedAt < order.placedAt ||
                  (previous?.deliveredAt &&
                    shippedAt < previous.deliveredAt))) ||
              (deliveredAt &&
                (!shippedAt || deliveredAt < shippedAt || deliveredAt > now))
            )
              throw new ShippingError("SHIPPING_DATE");
            if (
              leg.shippedAt &&
              (!leg.costAmount.equals(data.costAmount) ||
                leg.costCurrency !== data.costCurrency)
            )
              throw new ShippingError("SHIPPING_COST_LOCKED");
            await tx.shipmentLeg.update({
              where: { id: leg.id },
              data: {
                ...data,
                costAmount: new Prisma.Decimal(data.costAmount),
                shippedAt,
                deliveredAt,
              },
            });
            if (data.status !== leg.status)
              await tx.trackingEvent.create({
                data: {
                  legId: leg.id,
                  userId,
                  status: data.status,
                  at:
                    deliveredAt ??
                    (data.status === "IN_TRANSIT" && !leg.shippedAt
                      ? shippedAt!
                      : now),
                },
              });
          }
        }
        const legs = await tx.shipmentLeg.findMany({ where: { shipmentId } });
        const status =
          operation === "cancelShipment" ? "CANCELLED" : shipmentStatus(legs);
        await tx.shipment.update({
          where: { id: shipmentId },
          data: { status, version: { increment: 1 } },
        });
        await audit(tx, userId, orderId, operation, shipmentId, shipment, {
          status,
          legs: legs.map((l) => ({
            ...l,
            costAmount: l.costAmount.toString(),
          })),
          ...(operation === "event" ? { description: raw.description } : {}),
        });
        const shipments = await tx.shipment.findMany({
          where: { orderId },
          include: { items: true, legs: true },
        });
        let current = order.status;
        const contact = order.contactSnapshot as {
          email: string;
          firstName: string;
        };
        if (
          current === "PROCESSING" &&
          shipments.some((s) => s.legs.some((l) => l.shippedAt))
        ) {
          await transition(tx, order, "SHIPPED", userId);
          current = "SHIPPED";
          const first = shipments
            .flatMap((s) => s.legs)
            .filter((l) => l.shippedAt)
            .sort((a, b) => a.shippedAt!.getTime() - b.shippedAt!.getTime())[0];
          await queueEmail(
            tx,
            "order.shipped",
            contact.email,
            order.locale as "fa" | "tr" | "en",
            {
              customerName: contact.firstName,
              orderNumber: order.number,
              trackingNumber: first?.trackingNumber ?? "",
            },
          );
        }
        if (
          current === "SHIPPED" &&
          allItemsDelivered(order.items, shipments)
        ) {
          await transition(
            tx,
            { ...order, status: current },
            "DELIVERED",
            userId,
          );
          await queueEmail(
            tx,
            "order.delivered",
            contact.email,
            order.locale as "fa" | "tr" | "en",
            { customerName: contact.firstName, orderNumber: order.number },
          );
        }
      },
      { timeout: 15000 },
    ),
  );
}
