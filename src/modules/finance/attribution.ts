import { Prisma } from "@prisma/client";
import { apportion } from "./apportion";
import { Exact } from "./operations-input";
type Tx = Prisma.TransactionClient;
export async function attributeEntry(
  tx: Tx,
  input: {
    entryId: string;
    orderId: string;
    marketId: string;
    variantId?: string;
    returnId?: string;
    debit: string;
    credit: string;
    amountTry: string;
    amountUsd: string;
  },
) {
  const income = ["sales", "shipping_income", "fees"];
  const sign = income.includes(input.credit)
    ? 1
    : income.includes(input.debit)
      ? -1
      : input.debit === "cogs"
        ? 1
        : input.credit === "cogs"
          ? -1
          : input.debit === "shipping_expense"
            ? 1
            : 0;
  if (!sign) return;
  if (
    await tx.financeAttribution.findFirst({
      where: { entryId: input.entryId },
      select: { id: true },
    })
  )
    return;
  const kind =
    income.includes(input.credit) || income.includes(input.debit)
      ? "revenue"
      : input.debit === "shipping_expense"
        ? "expense"
        : "cost";
  const items = await tx.orderItem.findMany({
    where: {
      orderId: input.orderId,
      ...(input.variantId ? { variantId: input.variantId } : {}),
    },
    include: {
      variant: {
        select: {
          product: { select: { id: true, categoryId: true, brandId: true } },
        },
      },
    },
  });
  const returns = input.returnId
    ? await tx.returnItem.findMany({
        where: { returnRequestId: input.returnId },
      })
    : [];
  const weights = items
    .filter(
      (i) => !input.returnId || returns.some((r) => r.orderItemId === i.id),
    )
    .map((i) => ({
      id: i.id,
      weight: input.returnId
        ? returns.find((r) => r.orderItemId === i.id)!.refundAmount.toFixed(4)
        : i.lineTotalAmount.toFixed(4),
    }));
  const tr = apportion(
      new Exact(input.amountTry).mul(sign).toFixed(4),
      weights,
    ),
    usd = apportion(new Exact(input.amountUsd).mul(sign).toFixed(4), weights);
  for (const item of items.filter((i) => Object.hasOwn(tr, i.id))) {
    const values = {
      revenueTry: "0",
      revenueUsd: "0",
      costTry: "0",
      costUsd: "0",
      expenseTry: "0",
      expenseUsd: "0",
      [`${kind}Try`]: tr[item.id],
      [`${kind}Usd`]: usd[item.id],
    };
    await tx.financeAttribution.create({
      data: {
        entryId: input.entryId,
        orderId: input.orderId,
        orderItemId: item.id,
        marketId: input.marketId,
        productId: item.variant.product.id,
        variantId: item.variantId,
        categoryId: item.variant.product.categoryId,
        brandId: item.variant.product.brandId,
        ...values,
      },
    });
  }
}
