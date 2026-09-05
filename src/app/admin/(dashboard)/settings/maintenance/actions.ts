"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { setMaintenanceFlag } from "@/modules/settings";
import { runAction, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  state: z.enum(["off", "on", "scheduled"]),
  messageFa: z.string().optional().default(""),
  messageTr: z.string().optional().default(""),
  messageEn: z.string().optional().default(""),
  allowlistIps: z.string().optional().default(""),
  startsAt: z.string().optional().default(""),
  endsAt: z.string().optional().default(""),
});

// Deliberately NOT wrapped in withMutation (Phase 01a §2): this is the
// escape hatch that must always be able to turn maintenance back OFF, even
// while maintenance is currently on — mirroring the ops-driven
// POST /api/system/maintenance route, which is likewise outside the
// mutation-gate/in-flight-counter machinery (D23 restore safety concerns
// only the plain on/off flag those two paths share, not this JSON config).
export async function saveMaintenance(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.maintenance.edit");
    const userId = session.user.id;

    const parsed = schema.parse(Object.fromEntries(data));
    const allowlistIps = parsed.allowlistIps
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const maintenance = {
      state: parsed.state,
      message: {
        fa: parsed.messageFa,
        tr: parsed.messageTr,
        en: parsed.messageEn,
      },
      allowlistIps,
      startsAt: parsed.startsAt || undefined,
      endsAt: parsed.endsAt || undefined,
    };

    const current = await db.siteSettings.findUnique({
      where: { id: "default" },
    });
    await db.$transaction([
      db.siteSettings.update({
        where: { id: "default" },
        data: { maintenance },
      }),
      db.auditLog.create({
        data: {
          userId,
          action: "settings.maintenance.update",
          entityType: "SiteSettings",
          entityId: "default",
          before: (current?.maintenance ?? undefined) as object | undefined,
          after: maintenance,
        },
      }),
    ]);

    // Synchronous, same-process (D22 single-container) — keeps the
    // restore-safety write-gate flag consistent with what was just saved.
    setMaintenanceFlag(parsed.state === "on");
    revalidateTag("site-settings");
  });
}
