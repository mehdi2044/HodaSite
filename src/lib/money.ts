import Decimal from "decimal.js";
export type Currency = "USD" | "TRY" | "CAD" | "IRT";
export type RoundingRule = {
  mode: "HALF_UP" | "HALF_EVEN";
  increment: string;
  ending?: string;
};
export class Money {
  readonly amount: Decimal;
  constructor(
    value: string | Decimal,
    readonly currency: Currency,
  ) {
    this.amount = new Decimal(value);
  }
  add(other: Money) {
    if (other.currency !== this.currency)
      throw new Error("Cannot mix currencies");
    return new Money(this.amount.add(other.amount), this.currency);
  }
  round(rule: RoundingRule) {
    const mode =
      rule.mode === "HALF_EVEN"
        ? Decimal.ROUND_HALF_EVEN
        : Decimal.ROUND_HALF_UP;
    const increment = new Decimal(rule.increment);
    let result = this.amount
      .div(increment)
      .toDecimalPlaces(0, mode)
      .mul(increment);
    if (rule.ending !== undefined) {
      const ending = new Decimal(rule.ending);
      result = result.floor().add(ending);
      if (result.gt(this.amount) && result.sub(1).gte(0))
        result = result.sub(1);
    }
    return new Money(result, this.currency);
  }
  toString() {
    return this.amount.toFixed();
  }
}
export type FxSnapshot = Readonly<{
  base: Currency;
  quote: Currency;
  rate: string;
  capturedAt: string;
}>;
export function snapshotTotal(amount: Money, snapshot: FxSnapshot) {
  if (amount.currency !== snapshot.quote)
    throw new Error("Snapshot currency mismatch");
  return Object.freeze({
    amount: amount.toString(),
    currency: amount.currency,
    fxSnapshot: Object.freeze({ ...snapshot }),
  });
}
