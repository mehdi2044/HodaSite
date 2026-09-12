import Decimal from "decimal.js";
import { z } from "zod";
const Exact = Decimal.clone({ precision: 50 });
const day = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(`${v}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v
    );
  });
export function reportFilter(raw: unknown, now = new Date()) {
  const input = z
    .object({
      from: day.optional(),
      to: day.optional(),
      marketId: z.string().max(100).optional(),
    })
    .strict()
    .parse(raw);
  const today = now.toISOString().slice(0, 10);
  const from = input.from ?? `${today.slice(0, 7)}-01`,
    to = input.to ?? today;
  const start = new Date(`${from}T00:00:00Z`),
    end = new Date(`${to}T00:00:00Z`);
  if (end < start || end.getTime() - start.getTime() >= 366 * 86400000)
    throw new Error("INVALID_REPORT_PERIOD");
  end.setUTCDate(end.getUTCDate() + 1);
  return { from, to, start, end, marketId: input.marketId || undefined };
}
export const reportKinds = [
  "paidOrders",
  "externalPayments",
  "creditPayments",
  "externalRefunds",
  "creditRefunds",
  "undated",
] as const;
export type ReportKind = (typeof reportKinds)[number];
export type ReportEvent = {
  marketId: string;
  currency: string;
  kind: ReportKind;
  day: string | null;
  amount: string;
  count: string;
};
export type ReportTotals = Record<ReportKind, string> & {
  netExternal: string;
  orderCount: string;
};
export type ReportRow = {
  marketId: string;
  currency: string;
  totals: ReportTotals;
  days: Array<{ day: string; totals: ReportTotals }>;
};
const empty = (): ReportTotals => ({
  paidOrders: "0.0000",
  externalPayments: "0.0000",
  creditPayments: "0.0000",
  externalRefunds: "0.0000",
  creditRefunds: "0.0000",
  undated: "0",
  netExternal: "0.0000",
  orderCount: "0",
});
function add(t: ReportTotals, e: ReportEvent) {
  if (e.kind === "undated") {
    t.undated = new Exact(t.undated).add(e.count).toFixed(0);
    return;
  }
  t[e.kind] = new Exact(t[e.kind]).add(e.amount).toFixed(4);
  if (e.kind === "paidOrders")
    t.orderCount = new Exact(t.orderCount).add(e.count).toFixed(0);
  t.netExternal = new Exact(t.externalPayments)
    .sub(t.externalRefunds)
    .toFixed(4);
}
export function summarizeReports(events: ReportEvent[]): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const e of events) {
    const key = JSON.stringify([e.marketId, e.currency]);
    let row = groups.get(key);
    if (!row) {
      row = {
        marketId: e.marketId,
        currency: e.currency,
        totals: empty(),
        days: [],
      };
      groups.set(key, row);
    }
    add(row.totals, e);
    if (e.day) {
      let bucket = row.days.find((d) => d.day === e.day);
      if (!bucket) {
        bucket = { day: e.day, totals: empty() };
        row.days.push(bucket);
      }
      add(bucket.totals, e);
    }
  }
  return [...groups.values()]
    .map((r) => ({
      ...r,
      days: r.days.sort((a, b) => a.day.localeCompare(b.day)),
    }))
    .sort(
      (a, b) =>
        a.marketId.localeCompare(b.marketId) ||
        a.currency.localeCompare(b.currency),
    );
}
// Preserve all four stored decimal places; no Number conversion or FX repricing.
export function displayReportAmount(value: string, locale: string) {
  const [integer, fraction] = new Exact(value).toFixed(4).split(".");
  const separator = locale === "fa" ? "٬" : locale === "tr" ? "." : ",";
  const decimal = locale === "fa" ? "٫" : locale === "tr" ? "," : ".";
  const result =
    integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator) + decimal + fraction;
  return locale === "fa"
    ? result.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d.charCodeAt(0) - 48])
    : result;
}
export const csvColumns = [
  "market",
  "currency",
  "from",
  "to",
  "orderCount",
  "paidOrders",
  "externalPayments",
  "creditPayments",
  "externalRefunds",
  "creditRefunds",
  "netExternal",
  "undated",
] as const;
export function reportCsv(
  rows: ReportRow[],
  markets: Array<{ id: string; code: string }>,
  filter: { from: string; to: string },
  labels: readonly string[] = csvColumns,
) {
  const cell = (value: string) =>
    '"' +
    // A strict decimal literal is safe and must remain numeric in spreadsheets.
    // All other formula-like text (including -SUM(...)) stays neutralized.
    (/^[\s]*[=+@-]/.test(value) && !/^-?\d+(?:\.\d+)?$/.test(value)
      ? "'"
      : "") +
    value.replace(/"/g, '""') +
    '"';
  return (
    "\uFEFF" +
    [
      labels,
      ...rows.map((r) => [
        markets.find((m) => m.id === r.marketId)!.code,
        r.currency,
        filter.from,
        filter.to,
        r.totals.orderCount,
        r.totals.paidOrders,
        r.totals.externalPayments,
        r.totals.creditPayments,
        r.totals.externalRefunds,
        r.totals.creditRefunds,
        r.totals.netExternal,
        r.totals.undated,
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
