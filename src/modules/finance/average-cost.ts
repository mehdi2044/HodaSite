import { Prisma, type StockMovement } from "@prisma/client";
import { Exact, equivalents } from "./operations-input";
import { costSnapshot } from "./cost-snapshot";
type Tx = Prisma.TransactionClient;
type Value = {
  quantity: number;
  currency: string | null;
  amount: Prisma.Decimal;
  amountTry: Prisma.Decimal;
  amountUsd: Prisma.Decimal;
};
export async function initializeAverage(
  tx: Tx,
  stockItemId: string,
  excludeLotId?: string,
) {
  const old = await tx.stockValue.findUnique({ where: { stockItemId } });
  if (old) return old;
  const stock = await tx.stockItem.findUniqueOrThrow({
    where: { id: stockItemId },
  });
  const lots = await tx.lot.findMany({
    where: {
      variantId: stock.variantId,
      warehouseId: stock.warehouseId,
      qtyRemaining: { gt: 0 },
      ...(excludeLotId ? { id: { not: excludeLotId } } : {}),
    },
  });
  const currencies = [...new Set(lots.map((l) => l.unitCostCurrency))];
  if (currencies.length > 1) throw new Error("AVERAGE_MIXED_CURRENCY");
  let amount = new Exact(0),
    tr = new Exact(0),
    usd = new Exact(0),
    quantity = 0;
  for (const lot of lots) {
    const item = await tx.purchaseOrderItem.findUnique({
      where: { lotId: lot.id },
      select: { landedTotal: true },
    });
    const total =
      item?.landedTotal.toString() ??
      new Exact(lot.unitCostAmount.toString()).mul(lot.qtyReceived).toFixed(4);
    const remaining = new Exact(total).sub(
      new Exact(total)
        .mul(lot.qtyReceived - lot.qtyRemaining)
        .div(lot.qtyReceived)
        .toDecimalPlaces(4),
    );
    const rates = costSnapshot(
        lot.unitCostCurrency,
        lot.fxRateSnapshot,
        lot.receivedAt,
      ),
      eq = equivalents(remaining.toFixed(4), rates);
    quantity += lot.qtyRemaining;
    amount = amount.add(remaining);
    tr = tr.add(eq.amountTry);
    usd = usd.add(eq.amountUsd);
  }
  return tx.stockValue.create({
    data: {
      stockItemId,
      quantity,
      currency: currencies[0] ?? null,
      amount: amount.toFixed(4),
      amountTry: tr.toFixed(4),
      amountUsd: usd.toFixed(4),
    },
  });
}
async function enabled(tx: Tx, id: string) {
  return (
    (await tx.stockCostPolicy.findUnique({ where: { stockItemId: id } }))
      ?.method === "AVERAGE"
  );
}
export async function averageReceipt(
  tx: Tx,
  m: StockMovement,
  input: { currency: string; amount: string; rates: unknown; at: Date },
) {
  if (!(await enabled(tx, m.stockItemId))) return;
  const pool = await initializeAverage(tx, m.stockItemId, m.lotId ?? undefined);
  if (pool.quantity && pool.currency !== input.currency)
    throw new Error("AVERAGE_MIXED_CURRENCY");
  const rates = costSnapshot(input.currency, input.rates, input.at),
    eq = equivalents(input.amount, rates);
  await tx.stockValue.update({
    where: { stockItemId: m.stockItemId },
    data: {
      quantity: { increment: m.quantity },
      currency: input.currency,
      amount: { increment: input.amount },
      amountTry: { increment: eq.amountTry },
      amountUsd: { increment: eq.amountUsd },
    },
  });
  await tx.stockValuation.create({
    data: {
      movementId: m.id,
      stockItemId: m.stockItemId,
      quantity: m.quantity,
      currency: input.currency,
      amount: input.amount,
      ...eq,
      rateTry: rates.rateTry,
      rateUsd: rates.rateUsd,
      evidence: { method: "AVERAGE_RECEIPT", snapshot: rates },
    },
  });
}
/** Preserve each currency balance; reject an unrepresentable four-decimal valuation. */
export function averagePortion(pool: Value, quantity: number) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > pool.quantity ||
    !pool.currency
  )
    throw new Error("AVERAGE_QUANTITY");
  const portion = (v: Prisma.Decimal) =>
    new Exact(v.toString()).mul(quantity).div(pool.quantity).toFixed(4);
  const amount = portion(pool.amount),
    amountTry = portion(pool.amountTry),
    amountUsd = portion(pool.amountUsd);
  if (new Exact(amount).isZero()) {
    if (!new Exact(amountTry).isZero() || !new Exact(amountUsd).isZero())
      throw new Error("AVERAGE_PRECISION");
    return {
      currency: pool.currency,
      amount,
      amountTry,
      amountUsd,
      rateTry: "1",
      rateUsd: "1",
    };
  }
  const rateTry = new Exact(amountTry).div(amount).toFixed(12),
    rateUsd = new Exact(amountUsd).div(amount).toFixed(12);
  const check = equivalents(amount, { rateTry, rateUsd });
  if (
    check.amountTry !== amountTry ||
    check.amountUsd !== amountUsd ||
    new Exact(rateTry).lte(0) ||
    new Exact(rateUsd).lte(0)
  )
    throw new Error("AVERAGE_PRECISION");
  return {
    currency: pool.currency,
    amount,
    amountTry,
    amountUsd,
    rateTry,
    rateUsd,
  };
}
export async function averageOut(tx: Tx, m: StockMovement) {
  if (!(await enabled(tx, m.stockItemId))) return;
  // Configuration initializes the pool before any physical movement.
  const pool = await tx.stockValue.findUniqueOrThrow({
    where: { stockItemId: m.stockItemId },
  });
  const values = averagePortion(pool, -m.quantity);
  await tx.stockValuation.create({
    data: {
      movementId: m.id,
      stockItemId: m.stockItemId,
      quantity: m.quantity,
      ...values,
      evidence: {
        method: "MOVING_AVERAGE",
        before: {
          quantity: pool.quantity,
          amount: pool.amount.toFixed(4),
          amountTry: pool.amountTry.toFixed(4),
          amountUsd: pool.amountUsd.toFixed(4),
        },
      },
    },
  });
  await tx.stockValue.update({
    where: { stockItemId: m.stockItemId },
    data: {
      quantity: { decrement: -m.quantity },
      amount: { decrement: values.amount },
      amountTry: { decrement: values.amountTry },
      amountUsd: { decrement: values.amountUsd },
    },
  });
}
export async function averageReturn(tx: Tx, m: StockMovement, orderId: string) {
  if (!(await enabled(tx, m.stockItemId))) return;
  const sources = await tx.stockMovement.findMany({
    where: {
      stockItemId: m.stockItemId,
      lotId: m.lotId,
      referenceId: orderId,
      type: "OUT",
    },
    select: { id: true, quantity: true },
  });
  const valuations = await tx.stockValuation.findMany({
    where: { movementId: { in: sources.map((s) => s.id) } },
  });
  if (valuations.length !== sources.length || !valuations.length)
    throw new Error("AVERAGE_RETURN_HISTORY");
  const returnItems = await tx.returnItem.findMany({
    where: { orderItem: { orderId } },
    select: { id: true },
  });
  const prior = await tx.stockMovement.findMany({
    where: {
      id: { not: m.id },
      stockItemId: m.stockItemId,
      lotId: m.lotId,
      type: "RETURN_RESTOCK",
      referenceId: { in: returnItems.map((r) => r.id) },
    },
    select: { id: true, quantity: true },
  });
  const priorValues = await tx.stockValuation.findMany({
    where: { movementId: { in: prior.map((s) => s.id) } },
  });
  const sum = (key: "amount" | "amountTry" | "amountUsd") =>
    new Prisma.Decimal(
      valuations
        .reduce((n, r) => n.add(r[key].toString()), new Exact(0))
        .sub(
          priorValues.reduce((n, r) => n.add(r[key].toString()), new Exact(0)),
        )
        .toFixed(4),
    );
  const quantity =
    sources.reduce((n, r) => n - r.quantity, 0) -
    prior.reduce((n, r) => n + r.quantity, 0);
  const values = averagePortion(
    {
      quantity,
      currency: valuations[0].currency,
      amount: sum("amount"),
      amountTry: sum("amountTry"),
      amountUsd: sum("amountUsd"),
    },
    m.quantity,
  );
  const pool = await tx.stockValue.findUniqueOrThrow({
    where: { stockItemId: m.stockItemId },
  });
  if (pool.quantity && pool.currency !== values.currency)
    throw new Error("AVERAGE_MIXED_CURRENCY");
  await tx.stockValuation.create({
    data: {
      movementId: m.id,
      stockItemId: m.stockItemId,
      quantity: m.quantity,
      ...values,
      evidence: {
        method: "AVERAGE_RETURN",
        sourceMovements: sources.map((s) => s.id),
      },
    },
  });
  await tx.stockValue.update({
    where: { stockItemId: m.stockItemId },
    data: {
      quantity: { increment: m.quantity },
      currency: values.currency,
      amount: { increment: values.amount },
      amountTry: { increment: values.amountTry },
      amountUsd: { increment: values.amountUsd },
    },
  });
}
