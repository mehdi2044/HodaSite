import { z } from "zod";
import Decimal from "decimal.js";

export const invoiceLocale = z.enum(["fa", "tr", "en"]);
export type InvoiceLocale = z.infer<typeof invoiceLocale>;
const text = z.string().max(20000);
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/);
export const invoiceSettingsSchema = z.object({
  taxLabelFa: z.string().max(150).default(""),
  taxLabelTr: z.string().max(150).default(""),
  taxLabelEn: z.string().max(150).default(""),
  taxId: z.string().max(150).default(""),
});
export const invoiceSnapshotSchema = z.object({
  locale: invoiceLocale,
  number: text,
  placedAt: z.iso.datetime(),
  paidAt: z.iso.datetime(),
  currency: z.enum(["USD", "TRY", "CAD", "IRT"]),
  subtotal: amount,
  feesTotal: amount,
  discount: amount,
  total: amount,
  customer: text,
  address: text,
  bank: text,
  payment: text,
  brand: text,
  tagline: text,
  taxLabel: text,
  taxId: text,
  logoMediaId: z.string().nullable(),
  labels: z.record(z.string(), text),
  items: z
    .array(
      z.object({
        title: text,
        sku: text,
        quantity: z.number().int().positive(),
        unit: amount,
        total: amount,
      }),
    )
    .min(1)
    .max(200),
  fees: z
    .array(z.object({ label: text, amount, absorbed: z.boolean() }))
    .max(200),
});
export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;
export function localDigits(value: string, locale: InvoiceLocale): string {
  return locale === "fa"
    ? value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[parseInt(digit, 10)])
    : value;
}
export function invoiceMoney(value: string, locale: InvoiceLocale): string {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative())
    throw new Error("Invalid invoice amount");
  // Keep all stored significant decimals; never round money through a float.
  const [integer, fraction] = decimal
    .toFixed(Math.max(2, decimal.decimalPlaces()))
    .split(".");
  const group = locale === "tr" ? "." : locale === "fa" ? "٬" : ",";
  const separator = locale === "tr" ? "," : locale === "fa" ? "٫" : ".";
  return localDigits(
    integer.replace(/\B(?=(\d{3})+(?!\d))/g, group) + separator + fraction,
    locale,
  );
}
export function invoiceDate(value: string, locale: InvoiceLocale): string {
  return new Intl.DateTimeFormat(
    locale === "fa" ? "fa-IR-u-ca-persian" : locale,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    },
  ).format(new Date(value));
}
export const escapeInvoice = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Only accepts validated data and internally produced font/image data URLs. */
export function invoiceHtml(
  raw: InvoiceSnapshot,
  version: number,
  fonts: string,
  logo = "",
): string {
  const d = invoiceSnapshotSchema.parse(raw),
    rtl = d.locale === "fa";
  const e = escapeInvoice,
    label = (key: string) => e(d.labels[key] ?? "");
  const money = (v: string) =>
    `<bdi>${invoiceMoney(v, d.locale)} ${e(d.currency)}</bdi>`;
  const row = (key: string, value: string) =>
    `<div class="sum"><span>${label(key)}</span><strong>${money(value)}</strong></div>`;
  const safeLogo = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo)
    ? logo
    : "";
  return `<!doctype html><html lang="${d.locale}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'none'; base-uri 'none'"><title>${label("title")} ${e(d.number)}</title><style>
${fonts}
@page { size: A4; margin: 17mm 15mm 19mm; @bottom-center { content: counter(page${rtl ? ", persian" : ""}); font: 10pt Invoice; color: #666; } }
* { box-sizing: border-box; } body { margin:0; color:#222; font:11pt/1.8 Invoice, sans-serif; } h1,h2,p { margin:0; } h1 {font-size:24pt; line-height:1.4;} h2 {font-size:12pt;margin-bottom:6px;} header {border-bottom:3px solid #222;padding-bottom:20px;display:flex;justify-content:space-between;gap:24px;align-items:center;} .brand {font-size:18pt;font-weight:700;} .muted {color:#666;font-size:10pt;} .logo {max-width:120px;max-height:65px;object-fit:contain;} .meta,.parties {display:flex;justify-content:space-between;gap:25px;margin:20px 0;} .parties>div {width:50%;} .pre {white-space:pre-line;overflow-wrap:anywhere;} table {width:100%;border-collapse:collapse;table-layout:fixed;margin-top:20px;} thead {display:table-header-group;} th,td {padding:10px 7px;text-align:start;border-bottom:1px solid #dedbd6;vertical-align:top;overflow-wrap:anywhere;} th {background:#f5f3ef;font-weight:600;} th:first-child {width:40%;} tr {break-inside:avoid;} bdi {direction:ltr;unicode-bidi:isolate;} .totals {margin-top:18px;margin-inline-start:auto;width:60%;break-inside:avoid;} .sum {display:flex;justify-content:space-between;gap:15px;padding:7px 0;border-bottom:1px solid #dedbd6;} .sum:last-child {font-size:14pt;border-bottom:2px solid #222;} .payment {margin-top:25px;padding-top:15px;border-top:1px solid #dedbd6;break-inside:avoid;} .bank {direction:ltr;unicode-bidi:plaintext;text-align:start;} .sku {font-size:9pt;color:#666;} </style></head><body>
<header><div>${safeLogo ? `<img class="logo" src="${safeLogo}" alt="">` : ""}<div class="brand">${e(d.brand)}</div><p class="muted">${e(d.tagline)}</p></div><h1>${label("title")}</h1></header>
<div class="meta"><div>${label("order")} <bdi>${e(d.number)}</bdi><br>${label("version")} ${localDigits(String(version), d.locale)}</div><div>${label("placedAt")}: ${e(invoiceDate(d.placedAt, d.locale))}<br>${label("paidAt")}: ${e(invoiceDate(d.paidAt, d.locale))}</div></div>
<div class="parties"><div><h2>${label("customer")}</h2><p class="pre">${e(d.customer)}</p><p class="pre">${e(d.address)}</p></div><div>${d.taxId ? `<h2>${e(d.taxLabel)}</h2><bdi>${e(d.taxId)}</bdi>` : ""}</div></div>
<table><thead><tr><th>${label("item")}</th><th>${label("quantity")}</th><th>${label("unit")}</th><th>${label("amount")}</th></tr></thead><tbody>${d.items.map((i) => `<tr><td>${e(i.title)}<div class="sku"><bdi>${e(i.sku)}</bdi></div></td><td>${localDigits(String(i.quantity), d.locale)}</td><td>${money(i.unit)}</td><td>${money(i.total)}</td></tr>`).join("")}</tbody></table>
<div class="totals">${row("subtotal", d.subtotal)}${d.fees.map((f) => `<div class="sum"><span>${e(f.label)}${f.absorbed ? ` (${label("absorbed")})` : ""}</span><strong>${money(f.absorbed ? "0" : f.amount)}</strong></div>`).join("")}${row("discount", d.discount)}${row("total", d.total)}</div>
<div class="payment"><h2>${label("payment")}</h2><p class="pre">${e(localDigits(d.payment, d.locale))}</p><p class="pre bank">${e(d.bank)}</p></div></body></html>`;
}
