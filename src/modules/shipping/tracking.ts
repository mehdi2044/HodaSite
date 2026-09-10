import { db } from "@/lib/db";
import { z } from "zod";
import { withMutation } from "@/lib/mutation-gate";
import { takeSecurityAttempt } from "@/modules/auth/security";
import { equalSecret, tokenHash } from "@/lib/secure-tokens";
import { trackingUrl } from "./validation";
/** Explicit public projection: never serialize the order, contact or cost rows. */
export async function trackingView(orderId: string) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      number: true,
      status: true,
      shipments: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          nameI18n: true,
          legs: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              labelI18n: true,
              type: true,
              carrierName: true,
              service: true,
              trackingNumber: true,
              trackingUrlTemplate: true,
              status: true,
              shippedAt: true,
              eta: true,
              deliveredAt: true,
              events: {
                orderBy: { at: "asc" },
                select: { id: true, at: true, status: true, description: true },
              },
            },
          },
        },
      },
    },
  });
  return {
    number: order.number,
    status: order.status,
    shipments: order.shipments.map((s) => ({
      ...s,
      nameI18n: s.nameI18n as Record<string, string>,
      legs: s.legs.map((l) => ({
        id: l.id,
        labelI18n: l.labelI18n as Record<string, string>,
        type: l.type,
        carrierName: l.carrierName,
        service: l.service,
        trackingNumber: l.trackingNumber,
        trackingUrl: trackingUrl(l.trackingUrlTemplate, l.trackingNumber),
        status: l.status,
        shippedAt: l.shippedAt?.toISOString() ?? null,
        eta: l.eta?.toISOString() ?? null,
        deliveredAt: l.deliveredAt?.toISOString() ?? null,
        events: l.events.map((e) => ({ ...e, at: e.at.toISOString() })),
      })),
    })),
  };
}
export type TrackingView = Awaited<ReturnType<typeof trackingView>>;
export async function findPublicTracking(raw: unknown, ip: string) {
  const parsed = z
    .object({
      number: z.string().trim().min(1).max(64),
      email: z
        .email()
        .max(254)
        .transform((v) => v.trim().toLowerCase()),
    })
    .safeParse(raw);
  return withMutation(async () => {
    if (!(await takeSecurityAttempt(`tracking:ip:${ip}`, 30))) return null;
    if (!parsed.success) return null;
    const { number, email } = parsed.data;
    if (!(await takeSecurityAttempt(`tracking:lookup:${number}:${email}`, 10)))
      return null;
    const order = await db.order.findUnique({
      where: { number },
      select: { id: true, contactSnapshot: true },
    });
    const contact = order?.contactSnapshot as { email?: string } | undefined;
    if (
      !order ||
      !equalSecret(
        tokenHash(email),
        tokenHash((contact?.email ?? "").trim().toLowerCase()),
      )
    )
      return null;
    return trackingView(order.id);
  });
}
