import { z } from "zod";
import { PromotionDecimal as D, promotionAmountSchema } from "./contracts";

const lineSchema = z.object({
  target: z.enum(["MERCHANDISE", "SHIPPING"]),
  currency: z.string(),
  amount: promotionAmountSchema,
  allocations: z.array(
    z.object({ variantId: z.string(), amount: promotionAmountSchema }),
  ),
});
const evidenceSchema = z.object({
  discountTotal: promotionAmountSchema,
  lines: z.array(lineSchema),
});
type StoredAmount = { toString(): string };
type OrderAmounts = {
  currency: string;
  discountAmount: StoredAmount;
  items: { id: string; variantId: string; lineTotalAmount: StoredAmount }[];
  fees: { id: string; type: string; absorbed: boolean; amount: StoredAmount }[];
  promotionEvaluation: { result: unknown } | null;
};

/** Read immutable D72 evidence. Null means a legacy order; never guess on corrupt evidence. */
export function promotionOrderAmounts(order: OrderAmounts) {
  if (!order.promotionEvaluation) return null;
  const evidence = evidenceSchema.parse(order.promotionEvaluation.result);
  const netItems = new Map(
    order.items.map((i) => [i.id, new D(i.lineTotalAmount.toString())]),
  );
  const shippingFees = order.fees
    .filter((f) => f.type === "SHIPPING" && !f.absorbed)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const netShipping = new Map(
    shippingFees.map((f) => [f.id, new D(f.amount.toString())]),
  );
  let merchandise = new D(0),
    shipping = new D(0);
  for (const line of evidence.lines) {
    if (line.currency !== order.currency)
      throw new Error("PROMOTION_EVIDENCE_MISMATCH");
    if (line.target === "SHIPPING") {
      if (line.allocations.length)
        throw new Error("PROMOTION_EVIDENCE_MISMATCH");
      shipping = shipping.add(line.amount);
    } else {
      let allocated = new D(0);
      for (const a of line.allocations) {
        const item = order.items.find((i) => i.variantId === a.variantId);
        if (!item) throw new Error("PROMOTION_EVIDENCE_MISMATCH");
        const net = netItems.get(item.id)!.sub(a.amount);
        if (net.lt(0)) throw new Error("PROMOTION_EVIDENCE_MISMATCH");
        netItems.set(item.id, net);
        allocated = allocated.add(a.amount);
      }
      if (!allocated.eq(line.amount))
        throw new Error("PROMOTION_EVIDENCE_MISMATCH");
      merchandise = merchandise.add(line.amount);
    }
  }
  const total = merchandise.add(shipping);
  if (
    !total.eq(evidence.discountTotal) ||
    !total.eq(order.discountAmount.toString())
  )
    throw new Error("PROMOTION_EVIDENCE_MISMATCH");
  let left = shipping;
  for (const [id, amount] of netShipping) {
    const used = D.min(left, amount);
    netShipping.set(id, amount.sub(used));
    left = left.sub(used);
  }
  if (!left.isZero()) throw new Error("PROMOTION_EVIDENCE_MISMATCH");
  return { merchandise, shipping, netItems, netShipping };
}

const publicSnapshot = z.object({
  amount: promotionAmountSchema,
  titleI18n: z.object({ fa: z.string(), tr: z.string(), en: z.string() }),
});
/** Titles belong to the immutable redemption, not the live program. */
export function orderDiscountLines(
  redemptions: readonly { id: string; snapshot: unknown }[],
  locale: "fa" | "tr" | "en",
) {
  return redemptions.map((r) => {
    const s = publicSnapshot.parse(r.snapshot);
    return { id: r.id, title: s.titleI18n[locale], amount: s.amount };
  });
}
