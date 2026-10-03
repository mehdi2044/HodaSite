import { Prisma } from "@prisma/client";
import {
  evaluateStoredPromotions,
  type TrustedPromotionCart,
} from "./evidence";
import { PromotionDecimal as D } from "./contracts";

/** Public quote projection: never return rejected rules, segments, coupons or usage. */
export async function evaluatePromotionQuote(
  tx: Prisma.TransactionClient,
  cart: TrustedPromotionCart,
  customerId: string | null,
  codes: unknown,
  lock: boolean,
) {
  const { result, programs } = await evaluateStoredPromotions(
    tx,
    cart,
    customerId,
    codes,
    lock,
    undefined,
    true,
  );
  return {
    discountTotal: result.discountTotal,
    merchandiseDiscount: result.lines
      .filter((l) => l.target === "MERCHANDISE")
      .reduce((s, l) => s.add(l.amount), new D(0))
      .toFixed(4),
    shippingDiscount: result.lines
      .filter((l) => l.target === "SHIPPING")
      .reduce((s, l) => s.add(l.amount), new D(0))
      .toFixed(4),
    discountLines: result.lines.map((l) => ({
      ...l,
      title: (
        programs.find((p) => p.id === l.promotionId)!.revisions[0]
          .titleI18n as Record<string, string>
      )[cart.locale],
    })),
  };
}
