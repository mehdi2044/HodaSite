import Decimal from "decimal.js";

export type DisplayLine = {
  accountId: string;
  currency: string;
  debit: string;
  credit: string;
  debitTry: string;
  creditTry: string;
  debitUsd: string;
  creditUsd: string;
  rateTry: string;
  rateUsd: string;
};
const Exact = Decimal.clone({ precision: 60 });
export function journalTotals(lines: DisplayLine[]) {
  const sum = (
    key:
      "debit" | "credit" | "debitTry" | "creditTry" | "debitUsd" | "creditUsd",
    selected = lines,
  ) =>
    selected.reduce((total, l) => total.add(l[key]), new Exact(0)).toFixed(4);
  return [
    ...[...new Set(lines.map((l) => l.currency))].map((currency) => {
      const selected = lines.filter((l) => l.currency === currency);
      return {
        kind: "original" as const,
        currency,
        debit: sum("debit", selected),
        credit: sum("credit", selected),
      };
    }),
    {
      kind: "functional" as const,
      currency: "TRY",
      debit: sum("debitTry"),
      credit: sum("creditTry"),
    },
    {
      kind: "reporting" as const,
      currency: "USD",
      debit: sum("debitUsd"),
      credit: sum("creditUsd"),
    },
  ];
}
export function accountName(
  account: { code: string; nameI18n: unknown },
  locale: string,
) {
  const names = account.nameI18n;
  if (names && typeof names === "object" && !Array.isArray(names)) {
    const translations = names as Record<string, unknown>;
    const value = translations[locale] ?? translations.en ?? translations.fa;
    if (typeof value === "string" && value.trim()) return value;
  }
  return account.code;
}
