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

  /**
   * Round per a data-driven {@link RoundingRule}.
   *
   * Semantics (fix-order C1 — pinned by tests):
   *
   * 1. **Without `ending`:** round the amount to the nearest multiple of
   *    `increment`. `mode` decides an exact half: `HALF_UP` goes away from zero
   *    (12500 / 1000 → 13000, -12500 → -13000); `HALF_EVEN` goes to the even
   *    multiple (12500 → 12000, -12500 → -12000).
   *
   * 2. **With `ending`** (charm pricing, e.g. `.99`): round to the nearest
   *    value of the form `m·increment + ending` for integer `m` — i.e. the
   *    nearest "…99" price. `mode` breaks an exact tie. So 13.20 → 12.99 (it
   *    really is closer to 12.99 than 13.99) but 13.70 → 13.99, and 13.49 is
   *    the tie: `HALF_UP` → 13.99, `HALF_EVEN` → 12.99.
   *    - `ending` is taken modulo `increment`, so it always sits inside one
   *      step.
   *    - A non-negative amount never rounds to a negative charm price; the
   *      floor is `ending` itself (0.10 → 0.99, 0 → 0.99).
   *    - Negative amounts round to the nearest charm point with no clamping
   *      (-13.20 → -13.01).
   *
   * This replaces an earlier implementation that always dropped to the lower
   * charm bucket when `bucket + ending` exceeded the amount — that silently cut
   * a computed 13.70 to 12.99 (a full unit) and also assumed `increment === 1`.
   */
  round(rule: RoundingRule): Money {
    const mode =
      rule.mode === "HALF_EVEN"
        ? Decimal.ROUND_HALF_EVEN
        : Decimal.ROUND_HALF_UP;
    const increment = new Decimal(rule.increment);

    if (rule.ending === undefined) {
      const result = this.#amount
        .div(increment)
        .toDecimalPlaces(0, mode)
        .mul(increment);
      return new Money(result, this.currency);
    }

    const ending = new Decimal(rule.ending).mod(increment);
    let m = this.#amount.sub(ending).div(increment).toDecimalPlaces(0, mode);
    if (this.#amount.gte(0) && m.lt(0)) m = new Decimal(0);
    return new Money(m.mul(increment).add(ending), this.currency);
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
