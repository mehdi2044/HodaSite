import { db } from "@/lib/db";
import { ForbiddenError } from "./errors";

export type Scope = {
  marketId?: string;
  categoryId?: string;
  section?: string;
};

/**
 * Does a grant's scope cover a requested scope? (fix-order B2)
 *
 * - A grant with no scope (null / undefined / `{}`) means "all scopes".
 * - A scoped grant matches only when every key present in the grant equals the
 *   corresponding value in the request. A request that does not specify that
 *   key does not match a scoped grant.
 *
 * Query-level enforcement is Phase 05; the semantics are fixed here.
 */
export function scopeMatches(
  grant: unknown,
  request: Scope | undefined,
): boolean {
  if (grant == null || typeof grant !== "object") return true;
  const g = grant as Record<string, unknown>;
  const keys = Object.keys(g);
  if (keys.length === 0) return true;
  const r = (request ?? {}) as Record<string, unknown>;
  return keys.every((k) => r[k] === g[k]);
}

export async function can(
  userId: string,
  permission: string,
  scope?: Scope,
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!user?.isActive) return false;

  // Overrides win. A matching deny blocks outright; a matching allow grants.
  const matchingOverrides = user.overrides.filter(
    (o) => o.permission === permission && scopeMatches(o.scope, scope),
  );
  if (matchingOverrides.some((o) => !o.allow)) return false;
  if (matchingOverrides.some((o) => o.allow)) return true;

  // A role grants the permission only if the role is assigned in a scope that
  // covers the request and the role carries the permission (or "*").
  return user.roles.some(
    (ur) =>
      scopeMatches(ur.scope, scope) &&
      ur.role.permissions.some(
        (p) => p.permission === "*" || p.permission === permission,
      ),
  );
}

export async function assertCan(
  userId: string,
  permission: string,
  scope?: Scope,
): Promise<void> {
  if (!(await can(userId, permission, scope)))
    throw new ForbiddenError(permission, scope);
}

export { ForbiddenError, UnauthorizedError } from "./errors";
