"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  editorialId,
  istanbulTime,
  slots,
} from "@/modules/editorial/contracts";
import { saveWeeklyLook } from "@/modules/editorial/weekly";

export async function scheduleWeekly(
  _prev: ActionResult | null,
  form: FormData,
) {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await saveWeeklyLook(session.user.id, {
      id: editorialId.parse(form.get("id")),
      slot: z.enum(slots).parse(form.get("slot")),
      startsAt: istanbulTime.parse(form.get("start")),
      endsAt: istanbulTime.parse(form.get("end")),
    });
    revalidatePath("/admin/content/editorial/weekly");
  });
}
