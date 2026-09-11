"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError, ForbiddenError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { invoiceSettingsSchema } from "@/modules/orders/invoices/document";
import { regenerateInvoice } from "@/modules/orders/invoices/access";
export async function saveInvoiceSettings(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const userId = session.user.id;
  const id = z.string().min(1).max(100).parse(form.get("marketId"));
  await assertCan(userId, "markets.edit", { marketId: id });
  const settings = invoiceSettingsSchema.parse(Object.fromEntries(form));
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await assertCan(userId, "markets.edit", { marketId: id });
      const before = await tx.market.findUniqueOrThrow({
        where: { id },
        select: { invoiceSettings: true },
      });
      await tx.market.update({
        where: { id },
        data: { invoiceSettings: settings },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "invoice.settings",
          entityType: "Market",
          entityId: id,
          before: before.invoiceSettings as object,
          after: settings,
        },
      });
    }),
  );
  revalidatePath("/admin/settings/invoices");
  return { ok: true };
}
export async function generateInvoiceAction(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const input = z
    .object({
      orderId: z.string().min(1).max(100),
      version: z.coerce.number().int().min(0).max(2147483646),
    })
    .parse(Object.fromEntries(form));
  try {
    await regenerateInvoice(session.user.id, input.orderId, input.version);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError)
      throw error;
    if (
      error instanceof Error &&
      ["INVOICE_STALE", "INVOICE_UNPAID"].includes(error.message)
    )
      return { error: "INVALID_TRANSITION" };
    throw error;
  }
  revalidatePath("/admin/orders", "layout");
  return { ok: true };
}
