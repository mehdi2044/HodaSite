"use server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { revalidatePath, revalidateTag } from "next/cache";
export async function checkoutPolicyAction(form: FormData) {
  try {
    const userId = (await auth())?.user?.id;
    if (!userId) return { error: "LOGIN_REQUIRED" };
    await assertCan(userId, "markets.edit");
    const d = z
      .object({
        marketId: z.string().min(1),
        holdHours: z.coerce.number().int().min(1).max(168),
        paymentDeadlineHours: z.coerce.number().int().min(1).max(720),
        enabled: z.boolean(),
      })
      .refine((x) => x.holdHours <= x.paymentDeadlineHours)
      .parse({
        ...Object.fromEntries(form),
        enabled: form.get("enabled") === "on",
      });
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const before = await tx.market.findUniqueOrThrow({
          where: { id: d.marketId },
        });
        await tx.market.update({
          where: { id: d.marketId },
          data: {
            holdHours: d.holdHours,
            paymentDeadlineHours: d.paymentDeadlineHours,
            paymentMethods: d.enabled ? ["OFFLINE_BANK_TRANSFER"] : [],
          },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: "checkout.policy",
            entityType: "Market",
            entityId: d.marketId,
            before: {
              holdHours: before.holdHours,
              paymentDeadlineHours: before.paymentDeadlineHours,
            },
            after: d,
          },
        });
      }),
    );
    revalidateTag("markets");
    revalidatePath("/admin/settings/checkout");
    return { ok: true };
  } catch {
    return { error: "VALIDATION" };
  }
}
export async function guestPolicyAction(form: FormData) {
  try {
    const userId = (await auth())?.user?.id;
    if (!userId) return { error: "LOGIN_REQUIRED" };
    await assertCan(userId, "markets.edit");
    const guestCheckout = form.get("guestCheckout") === "on",
      termsPageId = z.string().max(100).parse(form.get("termsPageId"));
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const before = await tx.siteSettings.findUniqueOrThrow({
          where: { id: "default" },
        });
        await tx.siteSettings.update({
          where: { id: "default" },
          data: {
            checkout: {
              ...(before.checkout as Record<string, string | boolean>),
              guestCheckout,
              termsPageId,
            },
          },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: "checkout.settings",
            entityType: "SiteSettings",
            entityId: "default",
            after: { guestCheckout, termsPageId },
          },
        });
      }),
    );
    revalidatePath("/admin/settings/checkout");
    return { ok: true };
  } catch {
    return { error: "VALIDATION" };
  }
}
