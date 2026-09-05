"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  nameFa: z.string().min(1),
  nameTr: z.string().min(1),
  nameEn: z.string().min(1),
  taglineFa: z.string().optional().default(""),
  taglineTr: z.string().optional().default(""),
  taglineEn: z.string().optional().default(""),
  logoMediaId: z.string().optional().default(""),
  logoDarkMediaId: z.string().optional().default(""),
  faviconMediaId: z.string().optional().default(""),
  emailLogoMediaId: z.string().optional().default(""),
});

export async function saveBrand(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.brand.edit");
    const userId = session.user.id;

    const parsed = schema.parse(Object.fromEntries(data));
    const brand = {
      name: { fa: parsed.nameFa, tr: parsed.nameTr, en: parsed.nameEn },
      tagline: {
        fa: parsed.taglineFa,
        tr: parsed.taglineTr,
        en: parsed.taglineEn,
      },
    };

    await withMutation(async () => {
      const [currentSite, currentTheme] = await Promise.all([
        db.siteSettings.findUnique({ where: { id: "default" } }),
        db.themeSettings.findUniqueOrThrow({ where: { id: "default" } }),
      ]);
      const media = {
        logoMediaId: parsed.logoMediaId || currentTheme.logoMediaId,
        logoDarkMediaId: parsed.logoDarkMediaId || currentTheme.logoDarkMediaId,
        faviconMediaId: parsed.faviconMediaId || currentTheme.faviconMediaId,
        emailLogoMediaId:
          parsed.emailLogoMediaId || currentTheme.emailLogoMediaId,
      };
      await db.$transaction([
        db.siteSettings.update({ where: { id: "default" }, data: { brand } }),
        db.themeSettings.update({ where: { id: "default" }, data: media }),
        db.auditLog.create({
          data: {
            userId,
            action: "settings.brand.update",
            entityType: "SiteSettings",
            entityId: "default",
            before: {
              brand: currentSite?.brand ?? undefined,
              logoMediaId: currentTheme.logoMediaId,
              logoDarkMediaId: currentTheme.logoDarkMediaId,
              faviconMediaId: currentTheme.faviconMediaId,
              emailLogoMediaId: currentTheme.emailLogoMediaId,
            } as object,
            after: { brand, ...media },
          },
        }),
      ]);
    });

    revalidateTag("site-settings");
    revalidateTag("theme");
  });
}
