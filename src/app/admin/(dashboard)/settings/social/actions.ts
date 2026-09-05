"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { SOCIAL_KEYS, MARKET_CODES, type SocialByMarket } from "@/lib/social";

const urlOrEmpty = z.string().url().or(z.literal(""));
const shape: Record<string, z.ZodTypeAny> = {};
for (const market of MARKET_CODES) {
  for (const key of SOCIAL_KEYS) {
    shape[`${market}_${key}`] = urlOrEmpty.optional().default("");
  }
}
const schema = z.object(shape);

export async function saveSocial(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.social.edit");
    const userId = session.user.id;

    const parsed = schema.parse(Object.fromEntries(data)) as Record<
      string,
      string
    >;
    const social = {} as SocialByMarket;
    for (const market of MARKET_CODES) {
      social[market] = {};
      for (const key of SOCIAL_KEYS) {
        const value = parsed[`${market}_${key}`];
        if (value) social[market][key] = value;
      }
    }

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
