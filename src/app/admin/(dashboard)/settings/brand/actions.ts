"use server";
import { z } from "zod";
import { lockMediaReferences } from "@/modules/media/reference-lock";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { brandLogoWidth } from "@/lib/brand";

const schema = z.object({
  nameFa: z.string().min(1),
  nameTr: z.string().min(1),
  nameEn: z.string().min(1),
  taglineFa: z.string().optional().default(""),
  taglineTr: z.string().optional().default(""),
  taglineEn: z.string().optional().default(""),
  logoWidth: z.coerce.number().int().min(80).max(240).default(160),
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
    const requestedMediaIds = [
      parsed.logoMediaId,
      parsed.logoDarkMediaId,
      parsed.faviconMediaId,
      parsed.emailLogoMediaId,
    ].filter(Boolean);
    if (requestedMediaIds.length > 0) {
      const validImages = await db.media.count({
        where: {
          id: { in: requestedMediaIds },
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      });
      if (validImages !== new Set(requestedMediaIds).size)
        throw new Error("invalid_brand_media");
    }
    const brand = {
      name: { fa: parsed.nameFa, tr: parsed.nameTr, en: parsed.nameEn },
      tagline: {
        fa: parsed.taglineFa,
        tr: parsed.taglineTr,
        en: parsed.taglineEn,
      },
      logoWidth: parsed.logoWidth,
    };

    await withMutation(async () => {
      const [currentSite, currentTheme] = await Promise.all([
        db.siteSettings.findUnique({ where: { id: "default" } }),
        db.themeSettings.findUniqueOrThrow({ where: { id: "default" } }),
      ]);
      const media = {
        logoMediaId: data.has("logoMediaId")
          ? parsed.logoMediaId || null
          : currentTheme.logoMediaId,
        logoDarkMediaId: data.has("logoDarkMediaId")
          ? parsed.logoDarkMediaId || null
          : currentTheme.logoDarkMediaId,
        faviconMediaId: data.has("faviconMediaId")
          ? parsed.faviconMediaId || null
          : currentTheme.faviconMediaId,
        emailLogoMediaId: data.has("emailLogoMediaId")
          ? parsed.emailLogoMediaId || null
          : currentTheme.emailLogoMediaId,
      };
      const persistedBrand = {
        ...(currentSite?.brand &&
        typeof currentSite.brand === "object" &&
        !Array.isArray(currentSite.brand)
          ? currentSite.brand
          : {}),
        ...brand,
        logoWidth: data.has("logoWidth")
          ? parsed.logoWidth
          : brandLogoWidth(currentSite?.brand),
      };
      await db.$transaction(async (tx) => {
        await lockMediaReferences(tx, Object.values(media), {
          readyImages: true,
        });
        await Promise.all([
          tx.siteSettings.update({
            where: { id: "default" },
            data: { brand: persistedBrand },
          }),
          tx.themeSettings.update({ where: { id: "default" }, data: media }),
          tx.auditLog.create({
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
              after: { brand: persistedBrand, ...media },
            },
          }),
        ]);
      });
    });

    revalidateTag("site-settings");
    revalidateTag("theme");
  });
}
