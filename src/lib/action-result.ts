import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { MaintenanceError } from "@/lib/mutation-gate";
import { CustomCssError } from "@/lib/custom-css";

export type ActionResult =
  { ok: true } | { ok: false; code: string; message: string };

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
    const t = await getTranslations("errors");
    if (err instanceof ForbiddenError)
      return { ok: false, code: err.code, message: t("forbidden") };
    if (err instanceof UnauthorizedError)
      return { ok: false, code: err.code, message: t("unauthenticated") };
    if (err instanceof MaintenanceError)
      return { ok: false, code: "MAINTENANCE", message: t("maintenance") };
    if (err instanceof ZodError)
      return { ok: false, code: "VALIDATION", message: t("validation") };
    if (err instanceof CustomCssError)
      return { ok: false, code: "VALIDATION", message: err.message };
    throw err;
  }
}
