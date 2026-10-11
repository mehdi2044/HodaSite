import Decimal from "decimal.js";

const CURRENCY_SYMBOL: Record<string, string> = {
  IRT: "تومان",
  TRY: "₺",
  CAD: "CA$",
  USD: "$",
};

function grouped(value: string, thousands: string, decimalSeparator: string) {
  const [whole, decimal] = value.split(".");
  const signed = whole.startsWith("-");
  const digits = signed ? whole.slice(1) : whole;
  const result = digits.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return `${signed ? "-" : ""}${result}${decimal ? `${decimalSeparator}${decimal}` : ""}`;
}

export function toPersianDigits(value: string) {
  return value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

export function formatCatalogCurrency(
  amount: Decimal.Value,
  currency: "IRT" | "TRY" | "CAD" | "USD",
  locale: "fa" | "tr" | "en",
  preservePrecision = false,
) {
  const value = new Decimal(amount);
  const decimals = Math.max(
    currency === "IRT" ? 0 : 2,
    preservePrecision ? value.decimalPlaces() : 0,
  );
  const raw = value.toFixed(decimals);
  const localized = grouped(
    raw,
    locale === "fa" ? "٬" : locale === "tr" ? "." : ",",
    locale === "fa" ? "٫" : locale === "tr" ? "," : ".",
  );
  if (currency === "IRT") return `${toPersianDigits(localized)} تومان`;
  const symbol = CURRENCY_SYMBOL[currency];
  return `${symbol}${localized}`;
}

export function formatCatalogDate(date: Date, locale: "fa" | "tr" | "en") {
  return new Intl.DateTimeFormat(
    locale === "fa"
      ? "fa-IR-u-ca-persian"
      : locale === "tr"
        ? "tr-TR"
        : "en-CA",
    { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
  ).format(date);
}

/** Display only; quote values and submitted monetary snapshots stay exact. */
export function formatStorefrontAmount(
  amount: Decimal.Value,
  currency: string,
  locale: string,
) {
  if (
    ["IRT", "TRY", "CAD", "USD"].includes(currency) &&
    ["fa", "tr", "en"].includes(locale)
  )
    return formatCatalogCurrency(
      amount,
      currency as "IRT" | "TRY" | "CAD" | "USD",
      locale as "fa" | "tr" | "en",
      true,
    );
  return `${new Decimal(amount).toString()} ${currency}`;
}

/** Service units retain Decimal precision; never pass a wallet balance through Number. */
export function formatServiceUnits(
  value: Decimal.Value,
  locale: "fa" | "tr" | "en",
) {
  const raw = new Decimal(value).toFixed();
  const result = grouped(
    raw,
    locale === "fa" ? "٬" : locale === "tr" ? "." : ",",
    locale === "fa" ? "٫" : locale === "tr" ? "," : ".",
  );
  return locale === "fa" ? toPersianDigits(result) : result;
}
