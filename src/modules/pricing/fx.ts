import Decimal from "decimal.js";
import { z } from "zod";

export type FxRate = Readonly<{
  base: "USD";
  quote: "TRY" | "CAD" | "IRT";
  rate: string;
  provider: "frankfurter" | "navasan" | "manual";
  sourceField?: "usd_sell" | "usd_buy";
  fetchedAt: Date;
}>;

export interface FxProvider {
  readonly key: FxRate["provider"];
  fetchRates(): Promise<readonly FxRate[]>;
}

const frankfurterV2Row = z.object({
  base: z.string(),
  quote: z.string(),
  rate: z.union([z.string(), z.number()]),
});

const frankfurterV1 = z.object({
  rates: z.record(z.string(), z.union([z.string(), z.number()])),
});

export function parseFrankfurterV2(input: unknown, at = new Date()): FxRate[] {
  const rows = z.array(frankfurterV2Row).parse(input);
  return rows
    .filter(
      (row) =>
        row.base === "USD" && (row.quote === "TRY" || row.quote === "CAD"),
    )
    .map((row) => {
      const rate = new Decimal(row.rate);
      if (!rate.gt(0))
        throw new Error("Frankfurter returned a non-positive rate");
      return {
        base: "USD" as const,
        quote: row.quote as "TRY" | "CAD",
        rate: rate.toFixed(),
        provider: "frankfurter" as const,
        fetchedAt: at,
      };
    });
}

export function parseFrankfurterV1(input: unknown, at = new Date()): FxRate[] {
  const parsed = frankfurterV1.parse(input);
  return (["TRY", "CAD"] as const).flatMap((quote) => {
    const rate = parsed.rates[quote];
    if (rate === undefined) return [];
    const decimal = new Decimal(rate);
    if (!decimal.gt(0))
      throw new Error("Frankfurter returned a non-positive rate");
    return [
      {
        base: "USD" as const,
        quote,
        rate: decimal.toFixed(),
        provider: "frankfurter" as const,
        fetchedAt: at,
      },
    ];
  });
}

export class FrankfurterProvider implements FxProvider {
  readonly key = "frankfurter" as const;

  async fetchRates(): Promise<readonly FxRate[]> {
    try {
      const current = await fetch(
        "https://api.frankfurter.dev/v2/rates?base=USD&quotes=TRY,CAD",
        { signal: AbortSignal.timeout(10_000) },
      );
      if (current.ok) return parseFrankfurterV2(await current.json());
    } catch {
      // The legacy v1 endpoint is the documented availability fallback.
    }

    const legacy = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=TRY,CAD",
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!legacy.ok) throw new Error(`Frankfurter failed: ${legacy.status}`);
    return parseFrankfurterV1(await legacy.json());
  }
}

export class ManualFxProvider implements FxProvider {
  readonly key = "manual" as const;
  constructor(private readonly rates: readonly FxRate[] = []) {}
  async fetchRates(): Promise<readonly FxRate[]> {
    return this.rates;
  }
}

const navasanValue = z.union([
  z.object({ value: z.union([z.string(), z.number()]) }),
  z.string(),
  z.number(),
]);

export function parseNavasan(
  input: unknown,
  field: "usd_sell" | "usd_buy" = "usd_sell",
  at = new Date(),
): FxRate {
  const record = z.record(z.string(), z.unknown()).parse(input);
  const raw = navasanValue.parse(record[field]);
  const value = typeof raw === "object" ? raw.value : raw;
  const rate = new Decimal(value);
  if (!rate.gt(0)) throw new Error("Navasan returned a non-positive rate");
  // Navasan's usd_sell/usd_buy values are Toman, so no Rial conversion occurs.
  return {
    base: "USD",
    quote: "IRT",
    rate: rate.toFixed(),
    provider: "navasan",
    sourceField: field,
    fetchedAt: at,
  };
}

export class NavasanProvider implements FxProvider {
  readonly key = "navasan" as const;
  constructor(
    private readonly apiKey: string,
    private readonly field: "usd_sell" | "usd_buy" = "usd_sell",
  ) {}

  async fetchRates(): Promise<readonly FxRate[]> {
    const url = new URL("https://api.navasan.tech/latest/");
    url.searchParams.set("api_key", this.apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Navasan failed: ${response.status}`);
    return [parseNavasan(await response.json(), this.field)];
  }
}

export function jumpPercent(previous: string, next: string): string {
  const oldRate = new Decimal(previous);
  if (!oldRate.gt(0)) throw new Error("Previous FX rate must be positive");
  return new Decimal(next)
    .sub(oldRate)
    .abs()
    .div(oldRate)
    .mul(100)
    .toDecimalPlaces(4)
    .toFixed();
}

export function exceedsJumpGuard(
  previous: string,
  next: string,
  maxPercent: string,
): boolean {
  return new Decimal(jumpPercent(previous, next)).gt(maxPercent);
}
