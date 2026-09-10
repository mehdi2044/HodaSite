import { db } from "@/lib/db";
import { getDisplayPrice } from "@/modules/pricing";
import { availableForVariant } from "@/modules/inventory";
import { feeRuleApplies, computeFees, type FeeRuleInput } from "./index";

export type CartQuoteInput = Readonly<{
  marketId: string;
  locale?: "fa" | "tr" | "en";
  items: readonly { variantId: string; quantity: number }[];
  shippingRuleId?: string;
  address?: { province?: string; city?: string; postalCode?: string };
}>;

export async function quoteCart(input: CartQuoteInput) {
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
    include: { product: true },
  });
  if (variants.length !== new Set(items.map((item) => item.variantId)).size)
    throw new Error("One or more variants are unavailable");
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
        weightGrams: variant.weightGrams ?? variant.product.weightGrams,
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
    items: quoteItems,
    province: input.address?.province,
    city: input.address?.city,
    postalCode: input.address?.postalCode,
    volumetricDivisor: market.volumetricDivisor.toString(),
    locale: input.locale,
    shippingRuleId: input.shippingRuleId,
  };
  const result = computeFees(inputs, context);
  const shippingOptions = inputs
    .filter(
      (r) =>
        r.type === "SHIPPING" && r.selectable && feeRuleApplies(r, context),
    )
    .map((r) => ({
      id: r.id,
      label:
        (r.labelI18n as Record<string, string>)?.[input.locale ?? "en"] ?? r.id,
    }));
  return Object.freeze({
    shippingOptions,
    marketId: market.id,
    currency: market.currency,
    items: Object.freeze(quoteItems),
    ...result,
    quotedAt: new Date().toISOString(),
  });
}
