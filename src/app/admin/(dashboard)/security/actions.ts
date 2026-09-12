"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { can, assertCan, ForbiddenError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { cookies } from "next/headers";
/** Own display preference only; does not impersonate a user or grant access. */
export async function setAdminLocale(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const locale = z.enum(["fa", "tr", "en"]).parse(form.get("locale"));
  (await cookies()).set("hoda.admin.locale", locale, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86400,
  });
  revalidatePath("/admin", "layout");
}
export async function revokeSession(form: FormData) {
  const session = await auth();
  if (!session) throw new Error("UNAUTHENTICATED");
  const id = z.string().min(1).max(100).parse(form.get("id"));
  const mayRevokeOthers = await can(session.user.id, "security.session.revoke");
  const row = await db.adminSession.findFirst({
    where: { id, ...(mayRevokeOthers ? {} : { userId: session.user.id }) },
  });
  if (!row) throw new ForbiddenError("security.session.revoke");
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
