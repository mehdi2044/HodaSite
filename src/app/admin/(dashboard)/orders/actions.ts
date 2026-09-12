"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, ForbiddenError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import {
  approvePayment,
  rejectPayment,
  cancelOrder,
  extendOrderHold,
  CommerceError,
} from "@/modules/orders";
import {
  scopedAdminOrder,
  visibleOrderMarkets,
} from "@/modules/orders/service";
import { bankAccountSchema } from "@/modules/payments";
const input = z.object({
  orderId: z.string().min(1),
  operation: z.enum([
    "approve",
    "reject",
    "cancel",
    "cash",
    "extend",
    "note",
    "address",
  ]),
  reason: z.string().max(2000).default(""),
  hours: z.coerce.number().int().min(1).max(168).default(3),
  line1: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
});
export async function orderAction(form: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "LOGIN_REQUIRED" };
    const userId = session.user.id,
      data = input.parse(Object.fromEntries(form));
    await withMutation(async () => {
      if (data.operation === "approve" || data.operation === "cash")
        await approvePayment(data.orderId, userId, data.operation === "cash");
      if (data.operation === "reject")
        await rejectPayment(data.orderId, userId, data.reason);
      if (data.operation === "cancel") {
        if (!data.reason.trim()) throw new CommerceError("REASON_REQUIRED");
        await cancelOrder(data.orderId, data.reason, userId);
      }
      if (data.operation === "extend")
        await extendOrderHold(data.orderId, userId, data.hours);
      if (data.operation === "note" || data.operation === "address") {
        const order = await scopedAdminOrder(userId, "order.edit", {
          id: data.orderId,
        });
        await assertCan(userId, "order.edit", { marketId: order.marketId });
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
          const fresh = await tx.order.findUniqueOrThrow({
            where: { id: order.id },
          });
          if (
            data.operation === "address" &&
            ![
              "PENDING_PAYMENT",
              "AWAITING_VERIFICATION",
              "NEEDS_REVIEW",
              "PAID",
              "PROCESSING",
            ].includes(fresh.status)
          )
            throw new CommerceError("INVALID_TRANSITION");
          const address = {
            ...(fresh.shippingAddress as Record<string, string>),
            line1: data.line1 ?? "",
            city: data.city ?? "",
            province: data.province ?? "",
            postalCode: data.postalCode ?? "",
          };
          if (
            data.operation === "address" &&
            (!address.line1 || !address.city || !address.province)
          )
            throw new CommerceError("VALIDATION");
          await tx.order.update({
            where: { id: order.id },
            data:
              data.operation === "note"
                ? { adminNote: data.reason }
                : { shippingAddress: address },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: `admin_${data.operation}`,
              userId,
              note: data.operation === "note" ? data.reason : "",
            },
          });
          await tx.auditLog.create({
            data: {
              userId,
              action: `order.${data.operation}`,
              entityType: "Order",
              entityId: order.id,
            },
          });
        });
      }
    });
    revalidatePath("/admin/orders", "layout");
    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof CommerceError
          ? error.code
          : error instanceof ForbiddenError
            ? "FORBIDDEN"
            : "REQUEST_FAILED",
    };
  }
}
export async function bulkOrderAction(form: FormData) {
  const parsed = z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .safeParse(form.getAll("orderId"));
  if (!parsed.success) return { error: "VALIDATION" };
  let succeeded = 0,
    failed = 0,
    error: string | undefined;
  for (const id of new Set(parsed.data)) {
    const row = new FormData();
    row.set("orderId", id);
    row.set("operation", String(form.get("operation")));
    row.set("reason", String(form.get("reason") ?? ""));
    const result = await orderAction(row);
    if (result.error) {
      failed++;
      error = result.error;
    } else succeeded++;
  }
  return { ok: failed === 0, error, partial: { succeeded, failed } };
}
export async function bankAccountAction(form: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "LOGIN_REQUIRED" };
    const data = bankAccountSchema.parse({
      ...Object.fromEntries(form),
      isActive: form.get("isActive") === "on",
      instructionsI18n: {
        fa: form.get("instructionsFa") ?? "",
        tr: form.get("instructionsTr") ?? "",
        en: form.get("instructionsEn") ?? "",
      },
    });
    await assertCan(session.user.id, "markets.edit", {
      marketId: data.marketId,
    });
    await withMutation(() =>
      db.$transaction(async (tx) => {
        await assertCan(session.user.id, "markets.edit", {
          marketId: data.marketId,
        });
        const before = data.id
          ? await tx.marketBankAccount.findFirst({
              where: { id: data.id, marketId: data.marketId },
            })
          : null;
        if (data.id && !before) throw new ForbiddenError("markets.edit");
        const { id, ...values } = data;
        const after = id
          ? await tx.marketBankAccount.update({ where: { id }, data: values })
          : await tx.marketBankAccount.create({ data: values });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "payment.bank.update",
            entityType: "MarketBankAccount",
            entityId: after.id,
            before: before ? JSON.parse(JSON.stringify(before)) : undefined,
            after: JSON.parse(JSON.stringify(after)),
          },
        });
      }),
    );
    revalidatePath("/admin/payments/banks");
    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof ForbiddenError
          ? "FORBIDDEN"
          : error instanceof CommerceError
            ? error.code
            : "REQUEST_FAILED",
    };
  }
}

export async function saveOrderViewAction(form: FormData) {
  try {
    const userId = (await auth())?.user?.id;
    if (!userId) return { error: "LOGIN_REQUIRED" };
    if (!(await visibleOrderMarkets(userId)).length)
      throw new ForbiddenError("order.view");
    const data = z
      .object({
        name: z.string().trim().min(1).max(60),
        q: z.string().max(100).default(""),
        status: z.string().max(40).default(""),
      })
      .parse(Object.fromEntries(form));
    await withMutation(() =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const views = z
          .array(
            z.object({ name: z.string(), q: z.string(), status: z.string() }),
          )
          .safeParse(user.orderViews);
        const next = [
          ...(views.success ? views.data : [])
            .filter((v) => v.name !== data.name)
            .slice(-19),
          data,
        ];
        await tx.user.update({
          where: { id: userId },
          data: { orderViews: next },
        });
      }),
    );
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch {
    return { error: "REQUEST_FAILED" };
  }
}
