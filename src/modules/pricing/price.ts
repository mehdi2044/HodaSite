import Decimal from "decimal.js";
import type { Currency, RoundingRule } from "@/lib/money";
import { Money } from "@/lib/money";

export type PriceInput = {
  baseAmount: string;
  baseCurrency: "USD";
  marketCurrency: Currency;
  activeRate: string;
  markupPercent: string;
  roundingRule: RoundingRule;
  manualAmount?: string | null;
  compareAtBaseAmount?: string | null;
  manualCompareAtAmount?: string | null;
};

export type DisplayPrice = Readonly<{
  amount: string;
  compareAtAmount: string | null;
  currency: Currency;
  rate: string;
}>;

export function calculateDisplayPrice(input: PriceInput): DisplayPrice {
  const factor = new Decimal(input.activeRate).mul(
    new Decimal(1).plus(new Decimal(input.markupPercent).div(100)),
  );
  const amount = input.manualAmount
    ? new Money(input.manualAmount, input.marketCurrency)
    : new Money(input.baseAmount, input.baseCurrency)
        .mul(factor)
        .withCurrency(input.marketCurrency);
  const compareAt = input.manualCompareAtAmount
    ? new Money(input.manualCompareAtAmount, input.marketCurrency)
    : input.compareAtBaseAmount
      ? new Money(input.compareAtBaseAmount, input.baseCurrency)
          .mul(factor)
          .withCurrency(input.marketCurrency)
      : null;
  return Object.freeze({
    amount: amount.round(input.roundingRule).toString(),
    compareAtAmount: compareAt?.round(input.roundingRule).toString() ?? null,
    currency: input.marketCurrency,
    rate: new Decimal(input.activeRate).toFixed(),
  });
}
