"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { ForbiddenError, UnauthorizedError, assertCan } from "@/modules/access";
import { manageReturn } from "@/modules/returns/service";
import { returnPolicySchema } from "@/modules/returns/validation";
import { CommerceError } from "@/modules/orders/state";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
export async function manageReturnAction(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  try {
    await manageReturn(session.user.id, {
      returnId: form.get("returnId"),
      version: z.coerce.number().int().parse(form.get("version")),
      operation: form.get("operation"),
      note: form.get("note") ?? "",
      conditions: form
        .getAll("itemId")
        .map((id) => ({ itemId: id, condition: form.get(`condition:${id}`) })),
    });
    revalidatePath("/admin/returns");
    revalidatePath("/admin/orders", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) throw e;
    return { error: e instanceof CommerceError ? e.code : "REQUEST_FAILED" };
  }
}
export async function saveReturnPolicy(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const id = z.string().min(1).max(100).parse(form.get("marketId"));
  await assertCan(session.user.id, "markets.edit", { marketId: id });
  const data = returnPolicySchema.parse({
    enabled: form.get("enabled") === "on",
    days: z.coerce.number().parse(form.get("days")),
    excludedCategoryIds: form.getAll("excludedCategoryId"),
  });
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await assertCan(session.user!.id!, "markets.edit", { marketId: id });
      const before = await tx.market.findUniqueOrThrow({
        where: { id },
        select: { returnSettings: true },
      });
      await tx.market.update({ where: { id }, data: { returnSettings: data } });
      await tx.auditLog.create({
        data: {
          userId: session.user!.id,
          action: "return.policy",
          entityType: "Market",
          entityId: id,
          before: before.returnSettings as PrismaJson,
          after: data,
        },
      });
    }),
  );
  revalidatePath("/admin/returns/settings");
  return { ok: true };
}
type PrismaJson = import("@prisma/client").Prisma.InputJsonObject;
