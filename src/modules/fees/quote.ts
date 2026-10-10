import { promotionContextSchema } from "@/modules/promotions";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { evaluatePromotionQuote } from "@/modules/promotions/checkout-server";
import { db } from "@/lib/db";
import { getDisplayPrice } from "@/modules/pricing";
import { availableForVariant } from "@/modules/inventory";
import { feeRuleApplies, computeFees, type FeeRuleInput } from "./index";

export type CartQuoteInput = Readonly<{
  marketId: string;
  locale?: "fa" | "tr" | "en";
  items: readonly { variantId: string; quantity: number }[];
  /** Trusted server caller only: identity must come from the verified session. */
  promotions?: { customerId: string | null; couponCodes: unknown };
  shippingRuleId?: string;
  address?: { province?: string; city?: string; postalCode?: string };
}>;

const savedShippingSchema = z.object({
  province: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  shippingRuleId: z.string().max(100).optional(),
});

/** Saved drafts can be partial; invalid shipping must never become a fallback quote. */
export async function quoteSavedCart(input: CartQuoteInput, checkout: unknown) {
  const { shippingRuleId, ...address } = savedShippingSchema.parse(checkout);
  return quoteCart({
    ...input,
    address,
    shippingRuleId: shippingRuleId || undefined,
  });
}

export async function quoteCart(
  input: CartQuoteInput,
  transaction?: { tx: Prisma.TransactionClient; lockPromotions: boolean },
) {
  if (input.items.length === 0) throw new Error("Cart is empty");
  const market = await db.market.findUniqueOrThrow({
    where: { id: input.marketId },
  });
  if (!market.isActive || market.salesPaused)
    throw new Error("Market is unavailable");
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
      throw new Error("Cart quantities must be positive integers");
    const quantity = (quantities.get(item.variantId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity))
      throw new Error("Cart quantity is too large");
    quantities.set(item.variantId, quantity);
  }
  const items = [...quantities].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
  const variants = await db.variant.findMany({
    where: {
      id: { in: items.map((item) => item.variantId) },
      isActive: true,
      product: {
        status: "ACTIVE",
        deletedAt: null,
        marketIds: { has: input.marketId },
      },
    },
    include: { product: { include: { collections: true } } },
  });
  if (variants.length !== new Set(items.map((item) => item.variantId)).size)
    throw new Error("One or more variants are unavailable");
  if (variants.some((v) => v.product.coinPackCoins)) {
    const { fittingConfig } = await import("@/modules/fitting");
    if (!(await fittingConfig()).coinSalesEnabled)
      throw new Error("Coin pack sales are disabled");
  }
  const quoteItems = await Promise.all(
    items.map(async (item) => {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0)
        throw new Error("Cart quantities must be positive integers");
      const variant = variants.find(
        (candidate) => candidate.id === item.variantId,
      )!;
      if ((await availableForVariant(variant.id)) < item.quantity)
        throw new Error(`Insufficient stock for variant ${variant.id}`);
      const price = await getDisplayPrice(variant.product, variant, market);
      const dimensions = variant.dimensions as {
        lengthCm?: string;
        widthCm?: string;
        heightCm?: string;
      } | null;
      return {
        variantId: variant.id,
        quantity: item.quantity,
        unitPrice: price.amount,
        fxRate: price.rate,
        categoryId: variant.product.categoryId,
        weightGrams: variant.product.coinPackCoins
          ? 0
          : (variant.weightGrams ?? variant.product.weightGrams),
        ...(variant.product.coinPackCoins ? { shippable: false } : {}),
        lengthCm: dimensions?.lengthCm,
        widthCm: dimensions?.widthCm,
        heightCm: dimensions?.heightCm,
      };
    }),
  );
  const rules = await db.feeRule.findMany({ where: { marketId: market.id } });
  const inputs = rules.map((rule) => ({
    ...rule,
    params: rule.params as Record<string, unknown>,
    minAmount: rule.minAmount?.toString(),
    maxAmount: rule.maxAmount?.toString(),
  })) as FeeRuleInput[];
  const context = {
    currency: market.currency,
    now: new Date(),
    items: quoteItems,
    province: input.address?.province,
    city: input.address?.city,
    postalCode: input.address?.postalCode,
    volumetricDivisor: market.volumetricDivisor.toString(),
    locale: input.locale,
    shippingRuleId: input.shippingRuleId,
  };
  const gross = computeFees(inputs, context);
  const promotions = input.promotions
    ? await evaluatePromotionQuote(
        transaction?.tx ?? db,
        {
          marketId: market.id,
          currency: promotionContextSchema.shape.currency.parse(
            market.currency,
          ),
          locale: input.locale ?? "en",
          items: quoteItems.map((i) => {
            const v = variants.find((v) => v.id === i.variantId)!;
            return {
              variantId: v.id,
              productId: v.productId,
              categoryId: v.product.categoryId,
              collectionIds: v.product.collections.map((c) => c.id),
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            };
          }),
          shippingAmount:
            gross.lines.find((l) => l.type === "SHIPPING")?.chargedAmount ??
            "0",
        },
        input.promotions.customerId,
        input.promotions.couponCodes,
        transaction?.lockPromotions ?? false,
      )
    : {
        discountTotal: "0",
        merchandiseDiscount: "0",
        shippingDiscount: "0",
        discountLines: [],
      };
  const fees = computeFees(inputs, {
    ...context,
    promotionTax: {
      merchandise: promotions.merchandiseDiscount,
      shipping: promotions.shippingDiscount,
    },
  });
  const result = {
    ...fees,
    total: new Prisma.Decimal(fees.total)
      .sub(promotions.discountTotal)
      .toFixed(),
  };
  const shippingOptions = inputs
    .filter(
      (r) =>
        r.type === "SHIPPING" &&
        r.selectable &&
        quoteItems.some((i) => i.shippable !== false) &&
        feeRuleApplies(r, {
          ...context,
          items: quoteItems.filter((i) => i.shippable !== false),
        }),
    )
    .map((r) => ({
      id: r.id,
      label:
        (r.labelI18n as Record<string, string>)?.[input.locale ?? "en"] ?? r.id,
    }));
  return Object.freeze({
    ruleSnapshots: Object.fromEntries(
      result.lines.map((line) => [
        line.ruleId,
        JSON.parse(
          JSON.stringify(rules.find((rule) => rule.id === line.ruleId)!),
        ) as Record<string, unknown>,
      ]),
    ),
    ...promotions,
    feeTotal: new Prisma.Decimal(fees.total).sub(fees.subtotal).toFixed(),
    shippingOptions,
    marketId: market.id,
    currency: market.currency,
    items: Object.freeze(quoteItems),
    ...result,
    quotedAt: new Date().toISOString(),
  });
}
