"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
export async function revokeSession(form: FormData) {
  const session = await auth();
  if (!session) throw new Error("UNAUTHENTICATED");
  const id = z.string().min(1).max(100).parse(form.get("id"));
  const row = await db.adminSession.findUniqueOrThrow({ where: { id } });
  if (row.userId !== session.user.id)
    await assertCan(session.user.id, "security.session.revoke");
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.adminSession.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "security.session.revoked",
          entityType: "AdminSession",
          entityId: id,
        },
      });
    }),
  );
  revalidatePath("/admin/security");
}
export async function revokeOtherSessions() {
  const session = await auth();
  if (!session) throw new Error("UNAUTHENTICATED");
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.adminSession.updateMany({
        where: {
          userId: session.user.id,
          id: { not: session.adminSessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "security.sessions.revoked",
          entityType: "User",
          entityId: session.user.id,
        },
      });
    }),
  );
  revalidatePath("/admin/security");
}
