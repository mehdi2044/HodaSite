import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { MaintenanceError } from "@/lib/mutation-gate";
import { CustomCssError } from "@/lib/custom-css";
import faMessages from "../../messages/fa.json";

export type ActionResult =
  { ok: true } | { ok: false; code: string; message: string };

// Read directly from the fa message bundle rather than next-intl/server's
// getTranslations(): the admin panel has no language switcher yet (it is
// hard-coded Persian throughout, same as every other Phase 00/01a admin
// page), and getTranslations() needs Next's per-request async-storage
// context — it throws when a Server Action is invoked directly, outside a
// real HTTP request, which is exactly how
// tests/integration/role-least-privilege.spec.ts exercises this path.
const ERRORS = faMessages.errors;

/**
 * Runs a Server Action body and turns the typed errors it can throw
 * (ForbiddenError / UnauthorizedError / MaintenanceError / ZodError) into a
 * localized `ActionResult` instead of letting them crash to Next.js's generic
 * error boundary (Phase 01a §4). Anything else is a real bug and is rethrown.
 */
export async function runAction(
  fn: () => Promise<void>,
): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof ForbiddenError)
      return { ok: false, code: err.code, message: ERRORS.forbidden };
    if (err instanceof UnauthorizedError)
      return { ok: false, code: err.code, message: ERRORS.unauthenticated };
    if (err instanceof MaintenanceError)
      return { ok: false, code: "MAINTENANCE", message: ERRORS.maintenance };
    if (err instanceof ZodError)
      return { ok: false, code: "VALIDATION", message: ERRORS.validation };
    if (err instanceof CustomCssError)
      return { ok: false, code: "VALIDATION", message: err.message };
    throw err;
  }
}
