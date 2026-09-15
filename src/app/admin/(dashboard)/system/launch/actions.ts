"use server";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { runAction } from "@/lib/action-result";
import { recordLaunchEvidence } from "@/modules/launch/evidence";
export async function recordEvidenceAction(_: unknown, form: FormData) {
  return runAction(async () => {
    const s = await auth();
    if (!s?.user?.id) throw new UnauthorizedError();
    await assertCan(s.user.id, "settings.maintenance.edit");
    await recordLaunchEvidence(s.user.id, Object.fromEntries(form));
    // Return the result before navigating. The form loads a fresh document:
    // an RSC refresh of this large readiness page can leave streamed children
    // pending even after the server response has completed (browser regression).
  });
}
