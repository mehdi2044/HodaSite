import { z } from "zod";
import type { ShippingStatus } from "@prisma/client";
export class ShippingError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export const localized = z.object({
  fa: z.string().trim().min(1).max(100),
  tr: z.string().trim().min(1).max(100),
  en: z.string().trim().min(1).max(100),
});
export function trackingUrl(template: string, tracking: string): string | null {
  if (!template || !tracking || !validTrackingTemplate(template)) return null;
  return template.replaceAll("{tracking}", encodeURIComponent(tracking));
}
export function validTrackingTemplate(value: string) {
  if (!value) return true;
  if (/[\s\\\u0000-\u001f]/.test(value) || !value.includes("{tracking}"))
    return false;
  try {
    const url = new URL(value.replaceAll("{tracking}", "TRACKING"));
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.host.includes("TRACKING") &&
      !url.hash &&
      value.startsWith(`https://${url.host}/`)
    );
  } catch {
    return false;
  }
}
export const templateSchema = z.object({
  type: z.enum(["INTERNATIONAL", "DOMESTIC"]),
  labelI18n: localized,
  carrierName: z.string().trim().max(100).default(""),
  trackingUrlTemplate: z
    .string()
    .max(1000)
    .refine(validTrackingTemplate)
    .default(""),
});
export const workflowSchema = z.object({
  id: z.string().max(100).optional(),
  marketId: z.string().min(1).max(100),
  version: z.coerce.number().int().min(0).default(0),
  nameI18n: localized,
  isDefault: z.boolean(),
  isActive: z.boolean(),
  legs: z.array(templateSchema).min(1).max(8),
});
export const itemsSchema = z
  .array(
    z.object({
      orderItemId: z.string().min(1).max(100),
      quantity: z.coerce.number().int().min(1).max(10000),
    }),
  )
  .min(1)
  .max(100);
const date = z.preprocess(
  (v) =>
    v === "" || v == null
      ? null
      : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)
        ? v + ":00Z"
        : v,
  z.coerce.date().nullable(),
);
export const legUpdateSchema = z.object({
  carrierName: z.string().trim().max(100),
  service: z.string().trim().max(100),
  trackingNumber: z.string().trim().max(200),
  trackingUrlTemplate: z.string().max(1000).refine(validTrackingTemplate),
  costAmount: z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/),
  costCurrency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["PENDING", "IN_TRANSIT", "DELIVERED", "FAILED"]),
  shippedAt: date,
  eta: date,
  deliveredAt: date,
});
export const transitions: Record<ShippingStatus, readonly ShippingStatus[]> = {
  PENDING: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED", "FAILED"],
  FAILED: ["IN_TRANSIT"],
  DELIVERED: [],
  CANCELLED: [],
};
export function assertLegTransition(from: ShippingStatus, to: ShippingStatus) {
  if (from !== to && !transitions[from].includes(to))
    throw new ShippingError("SHIPPING_STATE");
}
export function assertAllocation(
  ordered: { id: string; quantity: number }[],
  allocated: { orderItemId: string; quantity: number }[],
  requested: z.infer<typeof itemsSchema>,
) {
  if (new Set(requested.map((i) => i.orderItemId)).size !== requested.length)
    throw new ShippingError("SHIPPING_QUANTITY");
  for (const item of requested) {
    const original = ordered.find((o) => o.id === item.orderItemId);
    const used = allocated
      .filter((i) => i.orderItemId === item.orderItemId)
      .reduce((n, i) => n + i.quantity, 0);
    if (!original || used + item.quantity > original.quantity)
      throw new ShippingError("SHIPPING_QUANTITY");
  }
}
export function shipmentStatus(
  legs: { status: ShippingStatus; shippedAt: Date | null }[],
): ShippingStatus {
  const active = legs.filter((l) => l.status !== "CANCELLED");
  if (!active.length) throw new ShippingError("SHIPPING_LAST_LEG");
  if (active.every((l) => l.status === "DELIVERED")) return "DELIVERED";
  if (active.some((l) => l.status === "FAILED")) return "FAILED";
  return active.some((l) => l.shippedAt) ? "IN_TRANSIT" : "PENDING";
}
export function allItemsDelivered(
  ordered: { id: string; quantity: number }[],
  shipments: {
    status: ShippingStatus;
    items: { orderItemId: string; quantity: number }[];
  }[],
) {
  return (
    ordered.length > 0 &&
    ordered.every(
      (o) =>
        shipments
          .filter((s) => s.status === "DELIVERED")
          .flatMap((s) => s.items)
          .filter((i) => i.orderItemId === o.id)
          .reduce((n, i) => n + i.quantity, 0) === o.quantity,
    )
  );
}
