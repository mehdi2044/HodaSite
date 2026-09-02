import Decimal from "decimal.js";

export type Currency = "USD" | "TRY" | "CAD" | "IRT";

export type RoundingRule = {
  mode: "HALF_UP" | "HALF_EVEN";
  /** Rounding step, e.g. "1000" for IRT, "0.01" for TRY/CAD. */
  increment: string;
  /** Optional psychological ending, e.g. "0.99". */
  ending?: string;
};

/**
 * Money is a closed value type (fix-order B1). The underlying `Decimal` is
 * `#private` — there is no accessor that hands it back — so a caller cannot do
 * `price.amount * rate` by hand. Every operation that changes the amount goes
 * through a method here, and none of them accept or return a `number`.
 * Multiplying by a scalar (FX, tax) takes a `string | Decimal` factor.
 */
export class Money {
  readonly #amount: Decimal;
  readonly currency: Currency;

  constructor(value: string | Decimal, currency: Currency) {
    this.#amount = value instanceof Decimal ? value : new Decimal(value);
    this.currency = currency;
  }

  #sameCurrency(other: Money): void {
    if (other.currency !== this.currency)
      throw new Error(
        `Cannot mix currencies: ${this.currency} and ${other.currency}`,
      );
  }

  add(other: Money): Money {
    this.#sameCurrency(other);
    return new Money(this.#amount.add(other.#amount), this.currency);
  }

  sub(other: Money): Money {
    this.#sameCurrency(other);
    return new Money(this.#amount.sub(other.#amount), this.currency);
  }

  /** Multiply by a dimensionless factor (never another Money). */
  mul(factor: string | Decimal): Money {
    return new Money(this.#amount.mul(new Decimal(factor)), this.currency);
  }

  /** `pct`% of this amount, e.g. `.percent("8")` for 8 %. */
  percent(pct: string | Decimal): Money {
    return new Money(
      this.#amount.mul(new Decimal(pct)).div(100),
      this.currency,
    );
  }

  round(rule: RoundingRule): Money {
    const mode =
      rule.mode === "HALF_EVEN"
        ? Decimal.ROUND_HALF_EVEN
        : Decimal.ROUND_HALF_UP;
    const increment = new Decimal(rule.increment);
    let result = this.#amount
      .div(increment)
      .toDecimalPlaces(0, mode)
      .mul(increment);
    if (rule.ending !== undefined) {
      const ending = new Decimal(rule.ending);
      result = result.floor().add(ending);
      if (result.gt(this.#amount) && result.sub(1).gte(0))
        result = result.sub(1);
    }
    return new Money(result, this.currency);
  }

  /** -1 if this < other, 0 if equal, 1 if this > other. Same currency only. */
  compare(other: Money): -1 | 0 | 1 {
    this.#sameCurrency(other);
    return this.#amount.cmp(other.#amount) as -1 | 0 | 1;
  }

  /** Exact decimal string, no grouping. */
  toString(): string {
    return this.#amount.toFixed();
  }

  /** Grouped, human-readable: "1,234.50 USD" (IRT has no minor unit).
   *  Grouping is string-based so no `number` conversion ever happens. */
  format(): string {
    const decimals = this.currency === "IRT" ? 0 : 2;
    const [int, frac] = this.#amount.toFixed(decimals).split(".");
    const sign = int.startsWith("-") ? "-" : "";
    const digits = sign ? int.slice(1) : int;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${sign}${grouped}${frac ? `.${frac}` : ""} ${this.currency}`;
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
