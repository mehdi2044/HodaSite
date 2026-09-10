import Decimal from "decimal.js";

export type FeeType = "SHIPPING" | "CUSTOMS" | "SERVICE" | "TAX";
export type FeeMethod =
  | "FIXED"
  | "PERCENT"
  | "PER_KG"
  | "WEIGHT_BRACKET"
  | "VALUE_BRACKET"
  | "PER_ITEM";

export type FeeRuleInput = Readonly<{
  id: string;
  type: FeeType;
  method: FeeMethod;
  params: Record<string, unknown>;
  labelI18n?: unknown;
  currency?: string;
  priority: number;
  province?: string | null;
  city?: string | null;
  postalPrefix?: string | null;
  categoryIds?: readonly string[];
  minAmount?: string | null;
  maxAmount?: string | null;
  selectable?: boolean;
  absorb?: boolean;
  taxable?: boolean;
  isActive: boolean;
  validFrom: Date;
  validUntil?: Date | null;
}>;

export type FeeItem = Readonly<{
  quantity: number;
  unitPrice: string;
  categoryId?: string | null;
  weightGrams: number;
  lengthCm?: string | null;
  widthCm?: string | null;
  heightCm?: string | null;
}>;

export type FeeContext = Readonly<{
  currency: string;
  items: readonly FeeItem[];
  shippingRuleId?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  volumetricDivisor: string;
  now?: Date;
  locale?: "fa" | "tr" | "en";
}>;

export type FeeLine = Readonly<{
  ruleId: string;
  type: FeeType;
  amount: string;
  chargedAmount: string;
  absorbed: boolean;
  label: string;
  explanation: string;
}>;

const ORDER: readonly FeeType[] = ["SHIPPING", "CUSTOMS", "SERVICE", "TAX"];

function decimalParam(rule: FeeRuleInput, key: string, fallback = "0") {
  const value = rule.params[key];
  if (typeof value !== "string" && typeof value !== "number")
    return new Decimal(fallback);
  return new Decimal(value);
}

function specificity(rule: FeeRuleInput): number {
  return (
    (rule.province ? 1 : 0) +
    (rule.city ? 2 : 0) +
    (rule.postalPrefix ? 4 : 0) +
    ((rule.categoryIds?.length ?? 0) > 0 ? 8 : 0)
  );
}

export function feeRuleApplies(rule: FeeRuleInput, ctx: FeeContext): boolean {
  const now = ctx.now ?? new Date();
  if (!rule.isActive || rule.validFrom > now) return false;
  if (rule.currency && rule.currency !== ctx.currency) return false;
  if (rule.validUntil && rule.validUntil <= now) return false;
  if (rule.province && rule.province !== ctx.province) return false;
  if (rule.city && rule.city !== ctx.city) return false;
  if (rule.postalPrefix && !ctx.postalCode?.startsWith(rule.postalPrefix))
    return false;
  if (
    rule.categoryIds?.length &&
    !ctx.items.some(
      (item) => item.categoryId && rule.categoryIds?.includes(item.categoryId),
    )
  )
    return false;
  return true;
}

function localizedLabel(rule: FeeRuleInput, locale: "fa" | "tr" | "en") {
  if (!rule.labelI18n || typeof rule.labelI18n !== "object") return rule.id;
  const labels = rule.labelI18n as Record<string, unknown>;
  const value = labels[locale] ?? labels.en ?? labels.fa ?? labels.tr;
  return typeof value === "string" && value.trim() ? value : rule.id;
}

export function chargeableWeightKg(
  items: readonly FeeItem[],
  divisor: string,
): Decimal {
  return items.reduce((total, item) => {
    const actual = new Decimal(item.weightGrams).div(1000);
    const volumetric =
      item.lengthCm && item.widthCm && item.heightCm
        ? new Decimal(item.lengthCm)
            .mul(item.widthCm)
            .mul(item.heightCm)
            .div(divisor)
        : new Decimal(0);
    return total.add(Decimal.max(actual, volumetric).mul(item.quantity));
  }, new Decimal(0));
}

function bracketAmount(
  brackets: unknown,
  value: Decimal,
  percentBase: Decimal,
): Decimal | null {
  if (!Array.isArray(brackets)) return null;
  for (const raw of brackets) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const upto = b.uptoKg ?? b.uptoAmount;
    if (typeof upto !== "string" && typeof upto !== "number") continue;
    if (value.lte(upto)) {
      if (typeof b.amount === "string" || typeof b.amount === "number")
        return new Decimal(b.amount);
      if (typeof b.percent === "string" || typeof b.percent === "number")
        return percentBase.mul(b.percent).div(100);
    }
  }
  return null;
}

function calculate(
  rule: FeeRuleInput,
  subtotal: Decimal,
  running: Readonly<Record<FeeType, Decimal>>,
  ctx: FeeContext,
): Decimal {
  const quantity = ctx.items.reduce((sum, item) => sum + item.quantity, 0);
  const weight = chargeableWeightKg(ctx.items, ctx.volumetricDivisor);
  let amount: Decimal;
  switch (rule.method) {
    case "FIXED":
      amount = decimalParam(rule, "amount");
      break;
    case "PERCENT": {
      const of = rule.params.of;
      let base = subtotal;
      if (of === "subtotal_plus_shipping") base = base.add(running.SHIPPING);
      if (of === "subtotal_plus_shipping_customs")
        base = base.add(running.SHIPPING).add(running.CUSTOMS);
      amount = base.mul(decimalParam(rule, "percent")).div(100);
      break;
    }
    case "PER_KG": {
      const minKg = decimalParam(rule, "minKg");
      amount = Decimal.max(weight, minKg).mul(decimalParam(rule, "perKg"));
      break;
    }
    case "PER_ITEM":
      amount = decimalParam(rule, "amount").mul(quantity);
      break;
    case "WEIGHT_BRACKET": {
      const found = bracketAmount(rule.params.brackets, weight, subtotal);
      if (found) amount = found;
      else {
        const rows = Array.isArray(rule.params.brackets)
          ? rule.params.brackets
          : [];
        const last = rows.at(-1) as Record<string, unknown> | undefined;
        const upto = last?.uptoKg;
        const base = last?.amount;
        amount = new Decimal(
          typeof base === "string" || typeof base === "number" ? base : 0,
        );
        if (typeof upto === "string" || typeof upto === "number")
          amount = amount.add(
            Decimal.max(weight.sub(upto), 0).mul(
              decimalParam(rule, "extraPerKg"),
            ),
          );
      }
      break;
    }
    case "VALUE_BRACKET":
      amount =
        bracketAmount(rule.params.brackets, subtotal, subtotal) ??
        new Decimal(0);
      break;
  }
  if (rule.minAmount) amount = Decimal.max(amount, rule.minAmount);
  if (rule.maxAmount) amount = Decimal.min(amount, rule.maxAmount);
  return amount.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function computeFees(
  rules: readonly FeeRuleInput[],
  ctx: FeeContext,
): Readonly<{
  subtotal: string;
  lines: readonly FeeLine[];
  total: string;
  chargeableWeightKg: string;
}> {
  if (
    ctx.shippingRuleId &&
    !rules.some(
      (r) =>
        r.id === ctx.shippingRuleId &&
        r.type === "SHIPPING" &&
        r.selectable &&
        feeRuleApplies(r, ctx),
    )
  )
    throw new Error("Invalid shipping selection");
  const subtotal = ctx.items.reduce(
    (sum, item) => sum.add(new Decimal(item.unitPrice).mul(item.quantity)),
    new Decimal(0),
  );
  const running: Record<FeeType, Decimal> = {
    SHIPPING: new Decimal(0),
    CUSTOMS: new Decimal(0),
    SERVICE: new Decimal(0),
    TAX: new Decimal(0),
  };
  const taxable: Record<FeeType, Decimal> = { ...running };
  const lines: FeeLine[] = [];
  for (const type of ORDER) {
    const selected = rules
      .filter(
        (rule) =>
          rule.type === type &&
          feeRuleApplies(rule, ctx) &&
          (type !== "SHIPPING" ||
            !ctx.shippingRuleId ||
            rule.id === ctx.shippingRuleId),
      )
      .sort(
        (a, b) =>
          specificity(b) - specificity(a) ||
          b.priority - a.priority ||
          a.id.localeCompare(b.id),
      )[0];
    if (!selected) continue;
    const amount = calculate(
      selected,
      subtotal,
      type === "TAX" ? taxable : running,
      ctx,
    );
    running[type] = amount;
    if (selected.taxable) taxable[type] = amount;
    lines.push({
      ruleId: selected.id,
      type,
      amount: amount.toFixed(),
      chargedAmount: selected.absorb ? "0" : amount.toFixed(),
      absorbed: Boolean(selected.absorb),
      label: localizedLabel(selected, ctx.locale ?? "en"),
      explanation: `${selected.method}:${selected.id}`,
    });
  }
  const charged = lines.reduce(
    (sum, line) => sum.add(line.chargedAmount),
    new Decimal(0),
  );
  return Object.freeze({
    subtotal: subtotal.toFixed(),
    lines: Object.freeze(lines),
    total: subtotal.add(charged).toFixed(),
    chargeableWeightKg: chargeableWeightKg(
      ctx.items,
      ctx.volumetricDivisor,
    ).toFixed(),
  });
}

export { quoteCart } from "./quote";
export type { CartQuoteInput } from "./quote";
export { parseFeeRuleParams } from "./validation";
