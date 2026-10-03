import {
  PromotionDecimal as D,
  promotionBatchSchema,
  promotionContextSchema,
  type PromotionCondition,
  type PromotionContext,
  type PromotionItem,
  type PromotionRevision,
  type PromotionSelector,
} from "./contracts";

type Amount = InstanceType<typeof D>;
export type PromotionReason =
  | "APPLIED"
  | "DISABLED"
  | "INACTIVE"
  | "OUTSIDE_WINDOW"
  | "MARKET_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "CONDITIONS_UNMET"
  | "COUPON_REQUIRED"
  | "CUSTOMER_REQUIRED"
  | "USAGE_UNAVAILABLE"
  | "TOTAL_CAP"
  | "CUSTOMER_CAP"
  | "BUDGET_EXCEEDED"
  | "CONFLICT"
  | "NO_BENEFIT";
export type ConditionResult = Readonly<{
  index: number;
  field: PromotionCondition["field"];
  matched: boolean;
}>;
export type PromotionExplanation = Readonly<{
  promotionId: string;
  revision: number;
  reason: PromotionReason;
  conditions: readonly ConditionResult[];
  conflictWith?: string;
}>;
export type DiscountLine = Readonly<{
  promotionId: string;
  revision: number;
  ruleVersion: 1;
  effect: PromotionRevision["definition"]["effect"]["type"];
  target: "MERCHANDISE" | "SHIPPING";
  currency: PromotionContext["currency"];
  amount: string;
  allocations: readonly Readonly<{ variantId: string; amount: string }>[];
}>;

const orderIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const zero = () => new D("0");
const sum = (xs: Iterable<Amount>) =>
  [...xs].reduce((a, b) => a.add(b), zero());
const down = (amount: Amount) => amount.toDecimalPlaces(4, D.ROUND_DOWN);
const maximum = new D("99999999999999.9999");

function selected(item: PromotionItem, s: PromotionSelector) {
  if (
    s.excludedProductIds.includes(item.productId) ||
    (item.categoryId !== null &&
      s.excludedCategoryIds.includes(item.categoryId)) ||
    item.collectionIds.some((id) => s.excludedCollectionIds.includes(id))
  )
    return false;
  return (
    (!s.productIds.length || s.productIds.includes(item.productId)) &&
    (!s.categoryIds.length ||
      (item.categoryId !== null && s.categoryIds.includes(item.categoryId))) &&
    (!s.collectionIds.length ||
      item.collectionIds.some((id) => s.collectionIds.includes(id)))
  );
}

function compare(
  actual: string | number,
  op: "gte" | "lte" | "eq",
  wanted: string | number,
) {
  const a = new D(actual);
  return op === "gte"
    ? a.gte(wanted)
    : op === "lte"
      ? a.lte(wanted)
      : a.eq(wanted);
}

function matches(
  c: PromotionCondition,
  ctx: PromotionContext,
  subtotal: Amount,
) {
  switch (c.field) {
    case "market":
      return ctx.marketId === c.value;
    case "locale":
      return ctx.locale === c.value;
    case "segment":
      return ctx.customer?.segmentIds.includes(c.value) ?? false;
    case "orders":
      return (
        ctx.customer?.orderCount !== null &&
        ctx.customer?.orderCount !== undefined &&
        compare(ctx.customer.orderCount, c.op, c.value)
      );
    case "subtotal":
      return compare(subtotal.toFixed(), c.op, c.value);
    case "quantity":
      return compare(
        ctx.items.reduce((n, i) => n + i.quantity, 0),
        c.op,
        c.value,
      );
    case "product":
      return ctx.items.some((i) => i.productId === c.value);
    case "category":
      return ctx.items.some((i) => i.categoryId === c.value);
    case "collection":
      return ctx.items.some((i) => i.collectionIds.includes(c.value));
    case "tag":
      return ctx.customer?.tags.includes(c.value) ?? false;
    case "consent":
      return (
        ctx.customer !== null && ctx.customer.consents[c.channel] === c.value
      );
  }
}

/** Allocate at four decimal places; sum equals amount, no line exceeds capacity. */
function allocate(amount: Amount, capacities: Map<string, Amount>) {
  const total = sum(capacities.values());
  const output = new Map<string, Amount>();
  if (total.isZero() || amount.isZero()) return output;
  const rows = [...capacities].sort(([a], [b]) => orderIds(a, b));
  for (const [id, capacity] of rows)
    output.set(id, down(amount.mul(capacity).div(total)));
  let remainder = amount.sub(sum(output.values()));
  for (const [id, capacity] of rows) {
    if (remainder.isZero()) break;
    const allocated = output.get(id)!;
    const extra = D.min(remainder, capacity.sub(allocated), "0.0001");
    output.set(id, allocated.add(extra));
    remainder = remainder.sub(extra);
  }
  if (!remainder.isZero())
    throw new Error("Discount allocation could not conserve amount");
  return new Map([...output].filter(([, value]) => value.gt(0)));
}

function benefit(
  p: PromotionRevision,
  ctx: PromotionContext,
  remaining: Map<string, Amount>,
  shipping: Amount,
) {
  const items = ctx.items.filter((i) => selected(i, p.definition.selector));
  const capacities = new Map(
    items.map((i) => [i.variantId, remaining.get(i.variantId)!]),
  );
  const total = sum(capacities.values());
  const effect = p.definition.effect;
  let amount = zero();
  let weights = capacities;
  switch (effect.type) {
    case "percent":
      amount = total.mul(effect.percent).div("100");
      break;
    case "fixed":
      amount = D.min(total, effect.amount);
      break;
    case "freeShipping":
      amount = items.length ? shipping : zero();
      break;
    case "spendXGetY": {
      // Qualification uses original selected line amounts; prior discounts do not
      // silently change the merchant's spend threshold.
      const original = sum(
        items.map((i) => new D(i.unitPrice).mul(i.quantity)),
      );
      let sets = original.div(effect.spend).floor();
      if (effect.maxSets !== null) sets = D.min(sets, effect.maxSets);
      amount = D.min(total, sets.mul(effect.amount));
      break;
    }
    case "buyXGetY": {
      const quantity = items.reduce((n, i) => n + i.quantity, 0);
      let rewards =
        Math.floor(quantity / (effect.buy + effect.get)) * effect.get;
      weights = new Map();
      // Sort by the original unit price; never expand high quantities into arrays.
      for (const item of [...items].sort(
        (a, b) =>
          new D(a.unitPrice).cmp(b.unitPrice) ||
          orderIds(a.variantId, b.variantId),
      )) {
        const units = Math.min(rewards, item.quantity);
        if (units === 0) continue;
        const value = down(
          remaining.get(item.variantId)!.mul(units).div(item.quantity),
        );
        weights.set(item.variantId, value);
        rewards -= units;
      }
      amount = sum(weights.values());
      break;
    }
  }
  if (p.definition.maxDiscount !== null)
    amount = D.min(amount, p.definition.maxDiscount);
  amount = down(amount);
  return {
    amount,
    allocations:
      effect.type === "freeShipping"
        ? new Map<string, Amount>()
        : allocate(amount, weights),
  };
}

/**
 * Offline evaluator only. Inputs must be derived by a permission/market-aware
 * server adapter. Eligibility snapshots do not authorize coupon redemption.
 * There is no DB, clock read, network request or mutation in this module.
 */
export function evaluatePromotions(revisions: unknown, context: unknown) {
  const candidates = promotionBatchSchema.parse(revisions);
  const ctx = promotionContextSchema.parse(context);
  const remaining = new Map(
    ctx.items.map((i) => [i.variantId, new D(i.unitPrice).mul(i.quantity)]),
  );
  const subtotal = sum(remaining.values());
  if (subtotal.gt(maximum)) throw new Error("Subtotal exceeds numeric(18,4)");
  let shipping = new D(ctx.shippingAmount);
  if (subtotal.add(shipping).gt(maximum))
    throw new Error("Merchandise plus shipping exceeds numeric(18,4)");
  const explanations: PromotionExplanation[] = [];
  const lines: DiscountLine[] = [];
  const applied: PromotionRevision[] = [];
  for (const p of [...candidates].sort(
    (a, b) => b.priority - a.priority || orderIds(a.id, b.id),
  )) {
    const conditions = Object.freeze(
      p.definition.conditions.map((c, index) =>
        Object.freeze({
          index,
          field: c.field,
          matched: matches(c, ctx, subtotal),
        }),
      ),
    );
    const record = (reason: PromotionReason, conflictWith?: string) =>
      explanations.push(
        Object.freeze({
          promotionId: p.id,
          revision: p.revision,
          reason,
          conditions,
          ...(conflictWith ? { conflictWith } : {}),
        }),
      );
    if (p.marketId !== ctx.marketId) {
      record("MARKET_MISMATCH");
      continue;
    }
    if (p.currency !== ctx.currency) {
      record("CURRENCY_MISMATCH");
      continue;
    }
    if (!p.enabled) {
      record("DISABLED");
      continue;
    }
    if (p.status !== "ACTIVE" && p.status !== "SCHEDULED") {
      record("INACTIVE");
      continue;
    }
    const now = Date.parse(ctx.now);
    if (
      now < Date.parse(p.startsAt) ||
      (p.endsAt !== null && now >= Date.parse(p.endsAt))
    ) {
      record("OUTSIDE_WINDOW");
      continue;
    }
    if (conditions.some((c) => !c.matched)) {
      record("CONDITIONS_UNMET");
      continue;
    }
    if (
      p.couponRequired &&
      !ctx.verifiedCoupons.some(
        (c) => c.promotionId === p.id && c.revision === p.revision,
      )
    ) {
      record("COUPON_REQUIRED");
      continue;
    }
    if (p.perCustomerCap !== null && !ctx.customer) {
      record("CUSTOMER_REQUIRED");
      continue;
    }
    const usage = ctx.usage.find(
      (u) => u.promotionId === p.id && u.revision === p.revision,
    );
    const limited =
      p.totalUsageCap !== null ||
      p.perCustomerCap !== null ||
      p.budget !== null;
    if (
      limited &&
      (!usage ||
        (p.perCustomerCap !== null &&
          (usage.customerId !== ctx.customer?.id ||
            usage.customerUsed === null)))
    ) {
      record("USAGE_UNAVAILABLE");
      continue;
    }
    if (p.totalUsageCap !== null && usage!.totalUsed >= p.totalUsageCap) {
      record("TOTAL_CAP");
      continue;
    }
    if (p.perCustomerCap !== null && usage!.customerUsed! >= p.perCustomerCap) {
      record("CUSTOMER_CAP");
      continue;
    }
    const conflict = applied.find(
      (other) =>
        p.excludes.includes(other.id) ||
        other.excludes.includes(p.id) ||
        (p.group === other.group &&
          (p.stacking === "EXCLUSIVE_GROUP" ||
            other.stacking === "EXCLUSIVE_GROUP")),
    );
    if (conflict) {
      record("CONFLICT", conflict.id);
      continue;
    }
    const { amount, allocations } = benefit(p, ctx, remaining, shipping);
    if (amount.isZero()) {
      record("NO_BENEFIT");
      continue;
    }
    if (p.budget !== null && new D(usage!.spent).add(amount).gt(p.budget)) {
      record("BUDGET_EXCEEDED");
      continue;
    }
    const target =
      p.definition.effect.type === "freeShipping" ? "SHIPPING" : "MERCHANDISE";
    if (target === "SHIPPING") shipping = shipping.sub(amount);
    else
      for (const [id, discount] of allocations)
        remaining.set(id, remaining.get(id)!.sub(discount));
    lines.push(
      Object.freeze({
        promotionId: p.id,
        revision: p.revision,
        ruleVersion: 1,
        effect: p.definition.effect.type,
        target,
        currency: ctx.currency,
        amount: amount.toFixed(4),
        allocations: Object.freeze(
          [...allocations].map(([variantId, value]) =>
            Object.freeze({ variantId, amount: value.toFixed(4) }),
          ),
        ),
      }),
    );
    applied.push(p);
    record("APPLIED");
  }
  const merchandiseDiscount = subtotal.sub(sum(remaining.values()));
  const shippingDiscount = new D(ctx.shippingAmount).sub(shipping);
  return Object.freeze({
    currency: ctx.currency,
    subtotal: subtotal.toFixed(4),
    merchandiseDiscount: merchandiseDiscount.toFixed(4),
    shippingDiscount: shippingDiscount.toFixed(4),
    discountTotal: merchandiseDiscount.add(shippingDiscount).toFixed(4),
    // Fees/tax are deliberately absent; this is not a checkout total.
    discountedSubtotal: sum(remaining.values()).toFixed(4),
    shippingRemaining: shipping.toFixed(4),
    lines: Object.freeze(lines),
    explanations: Object.freeze(explanations),
  });
}
