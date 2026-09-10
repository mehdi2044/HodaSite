import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, can, ForbiddenError, type Scope } from "./index";
import { PERMISSIONS } from "./namespace";
export const scopeSchema = z
  .object({
    marketId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    section: z.string().min(1).max(100).optional(),
  })
  .strict();
export function parseScope(form: FormData) {
  return scopeSchema.parse(
    Object.fromEntries(
      ["marketId", "categoryId", "section"].flatMap((key) =>
        form.get(key) ? [[key, String(form.get(key))]] : [],
      ),
    ),
  );
}
export async function validateScope(scope: Scope) {
  if (scope.marketId)
    await db.market.findUniqueOrThrow({ where: { id: scope.marketId } });
  if (scope.categoryId)
    await db.category.findUniqueOrThrow({ where: { id: scope.categoryId } });
}
export async function assertRoleGrant(
  actor: string,
  roleId: string,
  scope?: Scope,
) {
  const role = await db.role.findUniqueOrThrow({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (
    role.key === "owner" ||
    role.permissions.some((p) => p.permission === "*")
  ) {
    const owner = await db.userRole.findFirst({
      where: { userId: actor, role: { key: "owner" } },
    });
    if (!owner || (owner.scope && Object.keys(owner.scope as object).length))
      throw new ForbiddenError("security.role.manage");
    if (scope && Object.keys(scope).length)
      throw new Error("OWNER_SCOPE_REQUIRED");
  } else
    for (const { permission } of role.permissions)
      await assertCan(actor, permission, scope);
}
export async function lockSecurity(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('admin-security-management'))::text`;
}
export async function protectLastOwner(
  tx: Prisma.TransactionClient,
  userId: string,
  nextOwner: boolean,
  active: boolean,
) {
  const old = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    include: { overrides: true, roles: { include: { role: true } } },
  });
  if (
    old.roles.some((r) => r.role.key === "owner") &&
    (!nextOwner || !active)
  ) {
    const count = await tx.user.count({
      where: { isActive: true, roles: { some: { role: { key: "owner" } } } },
    });
    if (count <= 1) throw new Error("LAST_OWNER");
  }
  return old;
}
export const roleSchema = z.object({
  id: z.string().optional(),
  key: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/),
  name: z.string().min(1).max(100),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});
export async function previewRole(actor: string, roleId: string, scope: Scope) {
  await assertCan(actor, "security.role.manage");
  const role = await db.role.findUniqueOrThrow({
    where: { id: roleId },
    include: { permissions: true },
  });
  return Object.fromEntries(
    await Promise.all(
      PERMISSIONS.map(async (permission) => [
        permission,
        role.permissions.some(
          (p) => p.permission === "*" || p.permission === permission,
        ) && (await can(actor, permission, scope)),
      ]),
    ),
  );
}
