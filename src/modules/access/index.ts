import { isPermission } from "./namespace";
import { db } from "@/lib/db";
import { ForbiddenError } from "./errors";
import type { Prisma } from "@prisma/client";

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
  if (grant == null) return true;
  if (typeof grant !== "object" || Array.isArray(grant)) return false;
  const g = grant as Record<string, unknown>;
  const keys = Object.keys(g);
  if (keys.length === 0) return true;
  const r = (request ?? {}) as Record<string, unknown>;
  return keys.every(
    (k) =>
      ["marketId", "categoryId", "section"].includes(k) &&
      typeof g[k] === "string" &&
      g[k] !== "" &&
      r[k] === g[k],
  );
}

function readAccessSubject(
  userId: string,
  client: Pick<Prisma.TransactionClient, "user">,
) {
  return client.user.findUnique({
    where: { id: userId },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
}

export async function can(
  userId: string,
  permission: string,
  scope?: Scope,
  client: Pick<Prisma.TransactionClient, "user"> = db,
): Promise<boolean> {
  if (!isPermission(permission)) return false;
  const user = await readAccessSubject(userId, client);
  return evaluateAccess(user, permission, scope);
}

/** One fresh subject per operation; no shared or request-level permission cache.
 * Retain inactive markets so authorized historical orders remain addressable.
 * Callers retain their existing guard rechecks; return settlement still checks
 * again through the transaction client after acquiring its locks.
 */
export async function authorizedMarketIds(
  userId: string,
  permission: string,
  client: Pick<Prisma.TransactionClient, "user" | "market"> = db,
): Promise<string[]> {
  if (!isPermission(permission)) return [];
  const [subject, markets] = await Promise.all([
    readAccessSubject(userId, client),
    client.market.findMany({ select: { id: true } }),
  ]);
  return markets
    .filter((market) =>
      evaluateAccess(subject, permission, { marketId: market.id }),
    )
    .map((market) => market.id);
}
export type AccessSubject = {
  isActive: boolean;
  overrides: { permission: string; allow: boolean; scope: unknown }[];
  roles: { scope: unknown; role: { permissions: { permission: string }[] } }[];
};
export function evaluateAccess(
  user: AccessSubject | null,
  permission: string,
  scope?: Scope,
): boolean {
  if (!isPermission(permission)) return false;
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
  client: Pick<Prisma.TransactionClient, "user"> = db,
): Promise<void> {
  if (!(await can(userId, permission, scope, client)))
    throw new ForbiddenError(permission, scope);
}

export { ForbiddenError, UnauthorizedError } from "./errors";

export { PERMISSIONS, isPermission } from "./namespace";
