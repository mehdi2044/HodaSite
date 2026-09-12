import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { MaintenanceError } from "@/lib/mutation-gate";
import { CustomCssError } from "@/lib/custom-css";
import { getTranslations } from "next-intl/server";
import faMessages from "../../messages/fa.json";

export type ActionResult =
  { ok: true } | { ok: false; code: string; message: string };

// Direct action tests have no Next request context. HTTP requests use the
// active admin locale and database translation overrides; tests fall back to fa.
const ERRORS = faMessages.errors;
async function message(
  key: "forbidden" | "unauthenticated" | "maintenance" | "validation",
) {
  try {
    return (await getTranslations("errors"))(key);
  } catch {
    return ERRORS[key];
  }
}

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
      return { ok: false, code: err.code, message: await message("forbidden") };
    if (err instanceof UnauthorizedError)
      return {
        ok: false,
        code: err.code,
        message: await message("unauthenticated"),
      };
    if (err instanceof MaintenanceError)
      return {
        ok: false,
        code: "MAINTENANCE",
        message: await message("maintenance"),
      };
    if (err instanceof ZodError)
      return {
        ok: false,
        code: "VALIDATION",
        message: await message("validation"),
      };
    if (err instanceof CustomCssError)
      return {
        ok: false,
        code: "VALIDATION",
        message: await message("validation"),
      };
    throw err;
  }
}
