import Decimal from "decimal.js";
import { z } from "zod";
export const returnPolicySchema = z.object({
  enabled: z.boolean().default(true),
  days: z.number().int().min(1).max(365).default(14),
  excludedCategoryIds: z.array(z.string().min(1).max(100)).max(200).default([]),
});
export const returnRequestSchema = z
  .object({
    orderId: z.string().min(1).max(100),
    requestKey: z.string().uuid(),
    type: z.enum(["RETURN", "EXCHANGE"]),
    reasonCode: z.enum(["SIZE", "COLOR", "DEFECT", "OTHER"]),
    note: z.string().trim().max(2000).default(""),
    items: z
      .array(
        z.object({
          orderItemId: z.string().min(1).max(100),
          quantity: z.number().int().min(1).max(10000),
          exchangeVariantId: z.string().min(1).max(100).optional(),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((i) => i.orderItemId)).size !== v.items.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate order item",
        path: ["items"],
      });
    if (
      v.items.some((i) =>
        v.type === "EXCHANGE" ? !i.exchangeVariantId : !!i.exchangeVariantId,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid exchange selection",
        path: ["items"],
      });
  });
export const returnOperationSchema = z.object({
  returnId: z.string().min(1).max(100),
  version: z.number().int().min(0),
  operation: z.enum([
    "APPROVE",
    "REJECT",
    "IN_TRANSIT",
    "RECEIVE",
    "REFUND",
    "CREDIT",
    "EXCHANGE",
  ]),
  note: z.string().trim().max(2000).default(""),
  conditions: z
    .array(
      z.object({
        itemId: z.string().min(1).max(100),
        condition: z.enum(["RESTOCK", "QUARANTINE", "DAMAGED"]),
      }),
    )
    .max(50)
    .default([]),
});
/** Allocate order discounts across lines exactly; preserve any four-decimal remainder. */
export function returnLineBudgets(
  items: { id: string; lineTotalAmount: { toString(): string } }[],
  discount: string,
) {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const gross = sorted.reduce(
    (n, i) => n.add(i.lineTotalAmount.toString()),
    new Decimal(0),
  );
  const net = gross.sub(discount);
  if (net.lt(0) || new Decimal(discount).lt(0))
    throw new Error("Invalid order discount");
  let cumulative = new Decimal(0),
    allocated = new Decimal(0);
  return new Map(
    sorted.map((i) => {
      cumulative = cumulative.add(i.lineTotalAmount.toString());
      const end = gross.isZero()
        ? new Decimal(0)
        : net.mul(cumulative).div(gross).toDecimalPlaces(4, Decimal.ROUND_DOWN);
      const budget = end.sub(allocated);
      allocated = end;
      return [i.id, budget] as const;
    }),
  );
}
export function returnAmount(
  budget: Decimal.Value,
  sold: number,
  claimed: number,
  allocated: Decimal.Value,
  quantity: number,
) {
  if (
    ![sold, claimed, quantity].every(Number.isSafeInteger) ||
    quantity <= 0 ||
    claimed < 0 ||
    claimed + quantity > sold
  )
    throw new Error("Return quantity exceeds purchase");
  const left = new Decimal(budget).sub(allocated);
  if (left.lt(0)) throw new Error("Return amount exceeds purchase");
  return quantity === sold - claimed
    ? left
    : Decimal.min(
        left,
        new Decimal(budget)
          .mul(quantity)
          .div(sold)
          .toDecimalPlaces(4, Decimal.ROUND_DOWN),
      );
}
