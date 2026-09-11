import Decimal from "decimal.js";
import type {
  InvoiceLocale,
  InvoiceSnapshot,
} from "../../src/modules/orders/invoices/document";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
export function invoiceDocument(
  locale: InvoiceLocale = "fa",
  rows = 3,
): InvoiceSnapshot {
  return {
    locale,
    number: "IR-100123",
    placedAt: "2026-09-10T12:00:00.000Z",
    paidAt: "2026-09-11T10:00:00.000Z",
    currency: "IRT",
    subtotal: new Decimal("1234567.1234").mul(rows).toFixed(4),
    feesTotal: "25000",
    discount: "0",
    total: new Decimal("1234567.1234").mul(rows).plus("25000").toFixed(4),
    customer: "مشتری آزمایشی / Test Customer\nbuyer@example.com",
    address: "خیابان نمونه، ساختمان آزمایشی\nIstanbul / İstanbul\n34000",
    bank: "Example Bank\nTR00 0000 0000 0000 0000 0000 00",
    payment: "پرداخت تأییدشده / Payment approved",
    brand: "STYLE HUB",
    tagline: "پوشاک برای هر روز / Everyday clothing",
    taxLabel: "شناسهٔ مالیاتی / Tax ID",
    taxId: "TEST-123456",
    logoMediaId: null,
    labels: { fa, tr, en }[locale].invoice,
    items: Array.from({ length: rows }, (_, i) => ({
      title: {
        fa: "پیراهن آستین‌بلند پنبه‌ای، رنگ آبی روشن و سایز بزرگ",
        tr: "Uzun kollu pamuklu gömlek, açık mavi, büyük beden",
        en: "Long sleeve cotton shirt, light blue, large size",
      }[locale],
      sku: `SHIRT-BLUE-L-${i + 1}`,
      quantity: 1,
      unit: "1234567.1234",
      total: "1234567.1234",
    })),
    fees: [{ label: "ارسال / Shipping", amount: "25000", absorbed: false }],
  };
}
