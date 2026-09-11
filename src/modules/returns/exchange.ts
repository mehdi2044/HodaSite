import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { getDisplayPrice, getActiveRate } from "@/modules/pricing";
import {
  reserveOrderInventory,
  consumeOrderInventory,
} from "@/modules/inventory";
import { reserveCredit, consumeCredit } from "@/modules/credits";
import { queueInvoice } from "@/modules/orders/invoices/queue";
import { transition } from "@/modules/orders/service";
import { CommerceError } from "@/modules/orders/state";
export async function exchangeReturn(
  tx: Prisma.TransactionClient,
  returnId: string,
  userId: string,
) {
  const request = await tx.returnRequest.findUniqueOrThrow({
    where: { id: returnId },
    include: {
      items: { include: { orderItem: { include: { variant: true } } } },
      order: { include: { market: true } },
    },
  });
  if (
    request.type !== "EXCHANGE" ||
    request.status !== "RECEIVED" ||
    request.exchangeOrderId
  )
    throw new CommerceError("INVALID_TRANSITION");
  const original = request.order,
    market = original.market;
  if (!market.isActive || market.salesPaused)
    throw new CommerceError("MARKET_UNAVAILABLE");
  const lines: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
  let rate: string | undefined;
  for (const item of request.items) {
    const v = await tx.variant.findFirst({
      where: {
        id: item.exchangeVariantId ?? "",
        isActive: true,
        productId: item.orderItem.variant.productId,
        product: {
          status: "ACTIVE",
          deletedAt: null,
          OR: [
            { marketIds: { isEmpty: true } },
            { marketIds: { has: market.id } },
          ],
        },
      },
      include: { product: true, color: true, size: true },
    });
    if (!v) throw new CommerceError("RETURN_VARIANT");
    const price = await getDisplayPrice(v.product, v, market);
    if (rate && rate !== price.rate) throw new CommerceError("PRICE_CHANGED");
    rate = price.rate;
    lines.push({
      variantId: v.id,
      exchangeOfOrderItemId: item.orderItemId,
      quantity: item.quantity,
      unitPriceAmount: price.amount,
      lineTotalAmount: new Decimal(price.amount).mul(item.quantity).toFixed(),
      currency: market.currency,
      weightGrams: v.weightGrams ?? v.product.weightGrams,
      productSnapshot: {
        title: v.product.titleI18n,
        color: v.color.nameI18n,
        size: v.size.value,
        sku: v.sku,
      },
    });
  }
  const total = lines.reduce(
    (n, i) => n.add(String(i.lineTotalAmount)),
    new Decimal(0),
  );
  const tryMarket = await tx.market.findFirstOrThrow({
    where: { currency: "TRY" },
  });
  const tryRate =
    market.currency === "TRY" ? rate! : (await getActiveRate(tryMarket)).rate;
  const usd = total.div(rate!);
  const now = new Date(),
    hold = new Date(now.getTime() + market.holdHours * 3600000),
    deadline = new Date(now.getTime() + market.paymentDeadlineHours * 3600000);
  const cart = await tx.cart.create({
    data: {
      tokenHash: randomUUID(),
      customerId: original.customerId,
      marketId: market.id,
      locale: original.locale,
      currency: market.currency,
      expiresAt: deadline,
      completedAt: now,
    },
  });
  const sequence = await tx.orderSequence.upsert({
    where: { id: market.id },
    create: { id: market.id, value: 100001 },
    update: { value: { increment: 1 } },
  });
  const banks = await tx.marketBankAccount.findMany({
    where: { marketId: market.id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const order = await tx.order.create({
    data: {
      number: `${market.code}-${sequence.value}`,
      cartId: cart.id,
      marketId: market.id,
      customerId: original.customerId,
      parentOrderId: original.id,
      kind: "EXCHANGE",
      guestTokenHash: randomUUID(),
      locale: original.locale,
      currency: market.currency,
      subtotalAmount: total.toFixed(),
      feeTotalAmount: "0",
      totalAmount: total.toFixed(),
      totalAmountTry: usd.mul(tryRate).toDecimalPlaces(4).toFixed(),
      totalAmountUsd: usd.toDecimalPlaces(4).toFixed(),
      fxSnapshot: {
        marketPerUsd: rate!,
        tryPerUsd: tryRate,
        quotedAt: now.toISOString(),
        exchangeReturnId: returnId,
      },
      bankSnapshot: JSON.parse(JSON.stringify(banks)),
      contactSnapshot: original.contactSnapshot as Prisma.InputJsonValue,
      shippingAddress: original.shippingAddress as Prisma.InputJsonValue,
      billingAddress: original.billingAddress as Prisma.InputJsonValue,
      holdExpiresAt: hold,
      paymentDeadlineAt: deadline,
      items: { create: lines },
      events: {
        create: {
          type: "exchange.placed",
          userId,
          toStatus: "PENDING_PAYMENT",
        },
      },
    },
  });
  await reserveOrderInventory(
    tx,
    order.id,
    lines.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    "HOLD",
    hold,
  );
  const credit = await tx.storeCredit.create({
    data: {
      customerId: original.customerId,
      currency: original.currency,
      amount: request.refundAmount,
      balance: request.refundAmount,
      sourceReturnId: returnId,
    },
  });
  const { due } = await reserveCredit(
    tx,
    original.customerId,
    order.id,
    order.currency,
    total.toFixed(),
    credit.id,
  );
  if (new Decimal(due).isZero()) {
    await consumeOrderInventory(tx, order.id, userId);
    await consumeCredit(tx, order.id, userId);
    await transition(tx, order, "PAID", userId);
    await queueInvoice(tx, order.id, userId);
  } else {
    if (
      !banks.length ||
      !market.paymentMethods.includes("OFFLINE_BANK_TRANSFER")
    )
      throw new CommerceError("PAYMENT_UNAVAILABLE");
    await tx.payment.create({
      data: {
        orderId: order.id,
        amount: due,
        currency: order.currency,
        bankAccountId: banks[0].id,
      },
    });
  }
  return order;
}
