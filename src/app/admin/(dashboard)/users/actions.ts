"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";
import {
  assertRoleGrant,
  lockSecurity,
  protectLastOwner,
  parseScope,
  validateScope,
} from "@/modules/access/management";
import { withMutation } from "@/lib/mutation-gate";
async function actingUser() {
  const session = await auth();
  if (!session) throw new Error("UNAUTHENTICATED");
  await assertCan(session.user.id, "users.manage");
  return session.user.id;
}
const createSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(256),
  roleKey: z.string().min(1).max(40),
});
export async function createUser(form: FormData) {
  const actor = await actingUser(),
    input = createSchema.parse(Object.fromEntries(form)),
    scope = parseScope(form);
  await validateScope(scope);
  const passwordHash = await bcrypt.hash(input.password, 12);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await lockSecurity(tx);
      await assertCan(actor, "users.manage");
      const role = await tx.role.findUniqueOrThrow({
        where: { key: input.roleKey },
      });
      await assertRoleGrant(actor, role.id, scope);
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          roles: { create: { roleId: role.id, scope } },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor,
          action: "users.create",
          entityType: "User",
          entityId: user.id,
          after: {
            email: user.email,
            name: user.name,
            role: input.roleKey,
            scope,
          },
        },
      });
    }),
  );
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
const updateSchema = z.object({
  name: z.string().min(1).max(100),
  roleKey: z.string().min(1).max(40),
  isActive: z.enum(["true", "false"]),
});
export async function updateUser(id: string, form: FormData) {
  const actor = await actingUser(),
    input = updateSchema.parse(Object.fromEntries(form)),
    scope = parseScope(form);
  await validateScope(scope);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await lockSecurity(tx);
      await assertCan(actor, "users.manage");
      const role = await tx.role.findUniqueOrThrow({
        where: { key: input.roleKey },
      });
      await assertRoleGrant(actor, role.id, scope);
      const before = await protectLastOwner(
        tx,
        id,
        role.key === "owner",
        input.isActive === "true",
      );
      for (const grant of before.roles)
        await assertRoleGrant(
          actor,
          grant.roleId,
          (grant.scope as object) ?? undefined,
        );
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          isActive: input.isActive === "true",
          sessionVersion: { increment: 1 },
          roles: { create: { roleId: role.id, scope } },
        },
      });
      await tx.adminSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: actor,
          action: "users.update",
          entityType: "User",
          entityId: id,
          before: {
            name: before.name,
            isActive: before.isActive,
            roles: before.roles.map((r) => ({
              role: r.role.key,
              scope: r.scope,
            })),
          },
          after: {
            name: input.name,
            isActive: input.isActive === "true",
            role: input.roleKey,
            scope,
          },
        },
      });
    }),
  );
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
export async function setUserActive(id: string, active: boolean) {
  const actor = await actingUser();
  z.boolean().parse(active);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await lockSecurity(tx);
      await assertCan(actor, "users.manage");
      const before = await protectLastOwner(tx, id, true, active);
      for (const grant of before.roles)
        await assertRoleGrant(
          actor,
          grant.roleId,
          (grant.scope as object) ?? undefined,
        );
      if (before.isActive === active) return;
      await tx.user.update({
        where: { id },
        data: { isActive: active, sessionVersion: { increment: 1 } },
      });
      await tx.adminSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: actor,
          action: active ? "users.reactivate" : "users.deactivate",
          entityType: "User",
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive: active },
        },
      });
    }),
  );
  revalidatePath("/admin/users");
}
