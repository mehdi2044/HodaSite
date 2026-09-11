import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { currentCustomer } from "@/modules/customers";
import { can, assertCan, ForbiddenError } from "@/modules/access";
import { tokenHash } from "@/lib/secure-tokens";
import { withMutation } from "@/lib/mutation-gate";
import { queueInvoice } from "./queue";

export async function invoiceMarkets(
  userId: string,
  permission = "order.invoice.view",
) {
  const markets = await db.market.findMany({
    select: { id: true, code: true },
  });
  const visible = [];
  for (const market of markets)
    if (await can(userId, permission, { marketId: market.id }))
      visible.push(market);
  return visible;
}
/** Apply subject/market scope before selecting an order or an invoice. */
export async function invoiceOrder(number: string) {
  const session = await auth();
  const customer = await currentCustomer();
  const jar = await cookies();
  const token =
    jar.get(`hoda.order.${number}`)?.value ?? jar.get("hoda.cart")?.value;
  const markets = session?.user?.id
    ? await invoiceMarkets(session.user.id)
    : [];
  if (!customer && !token && markets.length === 0) return null;
  return db.order.findFirst({
    where: {
      number,
      OR: [
        ...(customer ? [{ customerId: customer.id }] : []),
        ...(token ? [{ guestTokenHash: tokenHash(token) }] : []),
        ...(markets.length
          ? [{ marketId: { in: markets.map((m) => m.id) } }]
          : []),
      ],
    },
    select: { id: true, number: true, paidAt: true, marketId: true },
  });
}
export async function regenerateInvoice(
  userId: string,
  orderId: string,
  expectedVersion: number,
) {
  const markets = await invoiceMarkets(userId);
  const order = await db.order.findFirst({
    where: { id: orderId, marketId: { in: markets.map((m) => m.id) } },
    select: { id: true, marketId: true },
  });
  if (!order) throw new ForbiddenError("order.invoice.view");
  await assertCan(userId, "order.edit", { marketId: order.marketId });
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      await assertCan(userId, "order.invoice.view", {
        marketId: order.marketId,
      });
      await assertCan(userId, "order.edit", { marketId: order.marketId });
      return queueInvoice(tx, orderId, userId, expectedVersion);
    }),
  );
}
