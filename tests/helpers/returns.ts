import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
/** Isolated sold stock, source lot and paid delivered order: never edits shared demo stock. */
export async function returnFixture(
  db: PrismaClient,
  options: {
    quantity?: number;
    price?: string;
    replacementPrice?: string;
    discount?: string;
    locale?: string;
    code?: string;
    customerId?: string;
    pending?: boolean;
  } = {},
) {
  const id = randomUUID(),
    quantity = options.quantity ?? 2,
    price = options.price ?? "10",
    discount = options.discount ?? "0";
  const market = await db.market.findUniqueOrThrow({
    where: { code: options.code ?? "TR" },
  });
  const template = await db.variant.findFirstOrThrow({
    include: { product: true },
  });
  const sizes = await db.size.findMany({ take: 2, orderBy: { id: "asc" } });
  const product = await db.product.create({
    data: {
      categoryId: template.product.categoryId,
      gender: "UNISEX",
      titleI18n: {
        fa: "محصول آزمایشی",
        tr: "Test ürünü",
        en: "Return test product",
      },
      slugI18n: { fa: id, tr: id, en: id },
      descriptionI18n: {},
      status: "ACTIVE",
      basePriceAmount: "1",
    },
  });
  const variants = [];
  for (let i = 0; i < 2; i++) {
    const variant = await db.variant.create({
      data: {
        productId: product.id,
        colorId: template.colorId,
        sizeId: sizes[i].id,
        sku: `RETURN-${id}-${i}`,
      },
    });
    await db.marketPrice.create({
      data: {
        variantId: variant.id,
        marketId: market.id,
        amount: i ? (options.replacementPrice ?? price) : price,
        currency: market.currency,
      },
    });
    variants.push(variant);
  }
  const warehouse = await db.warehouse.findFirstOrThrow({
    where: { isActive: true },
  });
  const stocks = [],
    lots = [];
  for (const [index, variant] of variants.entries()) {
    const sold = index === 0 && !options.pending ? quantity : 0;
    const stock = await db.stockItem.create({
      data: {
        warehouseId: warehouse.id,
        variantId: variant.id,
        onHand: 10 - sold,
        reserved: 0,
      },
    });
    const lot = await db.lot.create({
      data: {
        warehouseId: warehouse.id,
        variantId: variant.id,
        qtyReceived: 10,
        qtyRemaining: 10 - sold,
        unitCostAmount: "2",
        unitCostCurrency: market.currency,
        unitCostAmountTry: "2",
        unitCostAmountUsd: "0.1",
        fxRateSnapshot: {},
        receivedAt: new Date(),
      },
    });
    stocks.push(stock);
    lots.push(lot);
  }
  const customer = options.customerId
    ? await db.customer.findUniqueOrThrow({ where: { id: options.customerId } })
    : await db.customer.create({ data: { email: `return-${id}@example.com` } });
  const token = randomUUID(),
    locale = options.locale ?? "en";
  const cart = await db.cart.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      customerId: customer.id,
      marketId: market.id,
      currency: market.currency,
      locale,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const subtotal = new Prisma.Decimal(price).mul(quantity),
    total = subtotal.sub(discount);
  const order = await db.order.create({
    data: {
      number: `${market.code}-RETURN-${id}`,
      marketId: market.id,
      customerId: customer.id,
      cartId: cart.id,
      guestTokenHash: cart.tokenHash,
      locale,
      currency: market.currency,
      status: options.pending ? "PENDING_PAYMENT" : "DELIVERED",
      paidAt: options.pending ? null : new Date(),
      deliveredAt: options.pending ? null : new Date(),
      subtotalAmount: subtotal,
      discountAmount: discount,
      feeTotalAmount: "0",
      totalAmount: total,
      totalAmountTry: total,
      totalAmountUsd: total,
      fxSnapshot: {},
      bankSnapshot: [],
      contactSnapshot: { email: customer.email, firstName: "Return test" },
      shippingAddress: { line1: "Test address" },
      billingAddress: {},
      holdExpiresAt: new Date(Date.now() + 86400000),
      paymentDeadlineAt: new Date(Date.now() + 86400000),
      items: {
        create: {
          variantId: variants[0].id,
          quantity,
          unitPriceAmount: price,
          lineTotalAmount: subtotal,
          currency: market.currency,
          weightGrams: 100,
          productSnapshot: { title: product.titleI18n },
        },
      },
    },
    include: { items: true },
  });
  if (!options.pending) {
    await db.stockMovement.create({
      data: {
        stockItemId: stocks[0].id,
        warehouseId: warehouse.id,
        variantId: variants[0].id,
        lotId: lots[0].id,
        type: "OUT",
        quantity: -quantity,
        referenceId: order.id,
      },
    });
    await db.payment.create({
      data: {
        orderId: order.id,
        amount: total,
        currency: market.currency,
        status: "APPROVED",
      },
    });
  }
  return { order, customer, market, variants, stocks, lots, token };
}
