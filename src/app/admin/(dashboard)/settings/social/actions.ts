"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { SOCIAL_KEYS } from "./social-keys";

const urlOrEmpty = z.string().url().or(z.literal(""));
const schema = z.object(
  Object.fromEntries(
    SOCIAL_KEYS.map((k) => [k, urlOrEmpty.optional().default("")]),
  ),
);

export async function saveSocial(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.social.edit");
    const userId = session.user.id;

    const social = schema.parse(Object.fromEntries(data));

    await withMutation(async () => {
      const current = await db.siteSettings.findUnique({
        where: { id: "default" },
      });
      await db.$transaction([
        db.siteSettings.update({ where: { id: "default" }, data: { social } }),
        db.auditLog.create({
          data: {
            userId,
            action: "settings.social.update",
            entityType: "SiteSettings",
            entityId: "default",
            before: (current?.social ?? undefined) as object | undefined,
            after: social,
          },
        }),
      ]);
    });

    revalidateTag("site-settings");
  });
}
