"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, isPermission, ForbiddenError } from "@/modules/access";
import {
  lockSecurity,
  roleSchema,
  parseScope,
  validateScope,
} from "@/modules/access/management";
import { withMutation } from "@/lib/mutation-gate";
async function actor() {
  const session = await auth();
  if (!session) throw new Error("UNAUTHENTICATED");
  await assertCan(session.user.id, "security.role.manage");
  return session.user.id;
}
export async function saveRole(form: FormData) {
  const userId = await actor();
  const input = roleSchema.parse({
    id: form.get("id") || undefined,
    key: form.get("key"),
    name: form.get("name"),
    permissions: form.getAll("permissions"),
  });
  if (input.key === "owner") throw new ForbiddenError("security.role.manage");
  // An actor must not grant permissions they do not possess.
  for (const permission of input.permissions)
    await assertCan(userId, permission);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await lockSecurity(tx);
      await assertCan(userId, "security.role.manage");
      const before = input.id
        ? await tx.role.findUniqueOrThrow({
            where: { id: input.id },
            include: { permissions: true },
          })
        : null;
      if (before?.key === "owner")
        throw new ForbiddenError("security.role.manage");
      const role = before
        ? await tx.role.update({
            where: { id: before.id },
            data: {
              nameI18n: { fa: input.name, tr: input.name, en: input.name },
            },
          })
        : await tx.role.create({
            data: {
              key: input.key,
              nameI18n: { fa: input.name, tr: input.name, en: input.name },
            },
          });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: [...new Set(input.permissions)].map((permission) => ({
          roleId: role.id,
          permission,
        })),
      });
      await tx.user.updateMany({
        where: { roles: { some: { roleId: role.id } } },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.adminSession.updateMany({
        where: {
          user: { roles: { some: { roleId: role.id } } },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "security.role.updated",
          entityType: "Role",
          entityId: role.id,
          before: before
            ? { permissions: before.permissions.map((p) => p.permission) }
            : undefined,
          after: { permissions: input.permissions },
        },
      });
    }),
  );
  revalidatePath("/admin/security/roles");
}
export async function saveOverride(form: FormData) {
  const userId = await actor();
  const targetId = z.string().min(1).max(100).parse(form.get("userId"));
  const permission = z
    .string()
    .refine(isPermission)
    .parse(form.get("permission"));
  const mode = z.enum(["allow", "deny", "remove"]).parse(form.get("mode"));
  const scope = parseScope(form);
  await validateScope(scope);
  if (mode === "allow") await assertCan(userId, permission, scope);
  const owner = await db.userRole.findFirst({
    where: { userId: targetId, role: { key: "owner" } },
  });
  if (owner) throw new Error("OWNER_OVERRIDE_FORBIDDEN");
  await withMutation(() =>
    db.$transaction(async (tx) => {
      await lockSecurity(tx);
      await assertCan(userId, "security.role.manage");
      const before = await tx.userPermissionOverride.findUnique({
        where: { userId_permission: { userId: targetId, permission } },
      });
      if (mode === "remove")
        await tx.userPermissionOverride.deleteMany({
          where: { userId: targetId, permission },
        });
      else
        await tx.userPermissionOverride.upsert({
          where: { userId_permission: { userId: targetId, permission } },
          create: {
            userId: targetId,
            permission,
            scope,
            allow: mode === "allow",
          },
          update: { scope, allow: mode === "allow" },
        });
      await tx.user.update({
        where: { id: targetId },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.adminSession.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "security.override.updated",
          entityType: "User",
          entityId: targetId,
          before: before
            ? {
                permission: before.permission,
                allow: before.allow,
                scope: before.scope,
              }
            : undefined,
          after: { permission, mode, scope },
        },
      });
    }),
  );
  revalidatePath("/admin/security/roles");
}
