import type { Prisma } from "@prisma/client";
import { normalizeBrand } from "@/lib/brand";
import {
  invoiceLocale,
  invoiceSettingsSchema,
  invoiceSnapshotSchema,
  type InvoiceSnapshot,
} from "./document";
import fa from "../../../../messages/fa.json";
import tr from "../../../../messages/tr.json";
import en from "../../../../messages/en.json";
export const INVOICE_JOB = "invoice-generate";
const defaults = { fa, tr, en };
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
function addressText(value: unknown): string {
  const a = record(value);
  return [
    "firstName",
    "lastName",
    "line1",
    "line2",
    "city",
    "province",
    "postalCode",
    "country",
  ]
    .map((k) => str(a[k]))
    .filter(Boolean)
    .join("\n");
}
/** Caller holds the order row lock. Snapshot + Job commit with payment approval. */
export async function queueInvoice(
  tx: Prisma.TransactionClient,
  orderId: string,
  requestedBy?: string,
  expectedVersion?: number,
) {
  const first = await tx.invoice.findFirst({
    where: { orderId },
    orderBy: { version: "asc" },
  });
  const last = await tx.invoice.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
  });
  if (expectedVersion === undefined && first) return first;
  if (expectedVersion !== undefined && (last?.version ?? 0) !== expectedVersion)
    throw new Error("INVOICE_STALE");
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { orderBy: { id: "asc" } },
      fees: { orderBy: { id: "asc" } },
      payments: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "asc" },
      },
      market: true,
    },
  });
  if (!order.paidAt) throw new Error("INVOICE_UNPAID");
  const locale = invoiceLocale.parse(order.locale);
  const site = await tx.siteSettings.findUnique({ where: { id: "default" } });
  const theme = await tx.themeSettings.findUnique({ where: { id: "default" } });
  const brand = normalizeBrand(site?.brand);
  const settings = invoiceSettingsSchema.parse(order.market.invoiceSettings);
  const labels: Record<string, string> = { ...defaults[locale].invoice };
  const overrides = await tx.translation.findMany({
    where: {
      entityType: "ui",
      entityId: "global",
      locale,
      field: { startsWith: "invoice." },
    },
  });
  for (const row of overrides) {
    const key = row.field.slice(8);
    if (Object.hasOwn(labels, key) && row.value.length <= 20000)
      labels[key] = row.value;
  }
  const contact = record(order.contactSnapshot);
  const banks = Array.isArray(order.bankSnapshot) ? order.bankSnapshot : [];
  const financial = first
    ? invoiceSnapshotSchema.parse(first.snapshot)
    : {
        locale,
        number: order.number,
        placedAt: order.placedAt.toISOString(),
        paidAt: order.paidAt.toISOString(),
        currency: order.currency,
        subtotal: order.subtotalAmount.toString(),
        feesTotal: order.feeTotalAmount.toString(),
        discount: order.discountAmount.toString(),
        total: order.totalAmount.toString(),
        customer: [
          str(contact.firstName),
          str(contact.lastName),
          str(contact.email),
          str(contact.phone),
        ]
          .filter(Boolean)
          .join("\n"),
        address: addressText(
          Object.keys(record(order.billingAddress)).length
            ? order.billingAddress
            : order.shippingAddress,
        ),
        bank: banks
          .map((b) => {
            const a = record(b);
            return [a.bankName, a.holder, a.iban, a.accountNumber, a.cardNumber]
              .map(str)
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n"),
        payment: order.payments
          .map(
            (p) =>
              `${labels[p.method === "CASH" ? "cash" : p.method === "STORE_CREDIT" ? "storeCredit" : "transfer"]} · ${p.amount.toString()} ${p.currency}${p.reference ? ` · ${p.reference}` : ""}`,
          )
          .join("\n"),
        items: order.items.map((i) => {
          const p = record(i.productSnapshot);
          return {
            title:
              str(record(p.title)[locale]) ||
              str(record(p.title).en) ||
              str(p.sku),
            sku: str(p.sku),
            quantity: i.quantity,
            unit: i.unitPriceAmount.toString(),
            total: i.lineTotalAmount.toString(),
          };
        }),
        fees: order.fees.map((f) => ({
          label: f.label,
          amount: f.amount.toString(),
          absorbed: f.absorbed,
        })),
      };
  const snapshot: InvoiceSnapshot = invoiceSnapshotSchema.parse({
    ...financial,
    brand: brand.name[locale] || brand.name.en || "",
    tagline: brand.tagline[locale] || "",
    taxLabel:
      settings[
        locale === "fa"
          ? "taxLabelFa"
          : locale === "tr"
            ? "taxLabelTr"
            : "taxLabelEn"
      ] || labels.taxId,
    taxId: settings.taxId,
    logoMediaId: theme?.emailLogoMediaId || theme?.logoMediaId || null,
    labels,
  });
  const invoice = await tx.invoice.create({
    data: { orderId, version: (last?.version ?? 0) + 1, snapshot, requestedBy },
  });
  await tx.job.create({
    data: { type: INVOICE_JOB, payload: { invoiceId: invoice.id } },
  });
  await tx.auditLog.create({
    data: {
      userId: requestedBy,
      action: "invoice.request",
      entityType: "Invoice",
      entityId: invoice.id,
      after: { orderId, version: invoice.version },
    },
  });
  return invoice;
}
