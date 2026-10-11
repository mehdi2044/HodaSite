"use server";
import { FittingError } from "@/modules/fitting/contracts";
import { ZodError } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, ForbiddenError, UnauthorizedError } from "@/modules/access";
import { MaintenanceError } from "@/lib/mutation-gate";
import { revalidatePath } from "next/cache";
import {
  saveFittingSettings,
  grantFittingCoins,
  resolveFittingSession,
} from "@/modules/fitting/settings";
async function action(fn: () => Promise<unknown>) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "ai.settings.manage");
    await fn();
    revalidatePath("/admin/settings/fitting");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof FittingError
          ? e.code
          : e instanceof ZodError
            ? "INVALID_SELECTION"
            : e instanceof ForbiddenError
              ? "FORBIDDEN"
              : e instanceof UnauthorizedError
                ? "LOGIN_REQUIRED"
                : e instanceof MaintenanceError
                  ? "MAINTENANCE"
                  : "REQUEST_UNKNOWN",
    };
  }
}
export async function saveSettings(input: unknown) {
  return action(() => saveFittingSettings(input));
}
export async function grantCoinsAction(input: unknown) {
  return action(() => grantFittingCoins(input));
}
export async function refundSessionAction(input: unknown) {
  return action(() => resolveFittingSession(input));
}
