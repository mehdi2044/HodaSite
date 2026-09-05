import type { Scope } from "./index";

/** Thrown by a Server Action / route handler when there is no session at all. */
export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED" as const;
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown by `assertCan()` instead of a raw `Error("FORBIDDEN")` (Vee, Phase 00
 * review). Carries the permission/scope that was checked so callers and logs
 * can tell which check failed without parsing a message string.
 */
export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  readonly permission: string;
  readonly scope?: Scope;
  constructor(permission: string, scope?: Scope) {
    super(`FORBIDDEN: ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
    this.scope = scope;
  }
}
