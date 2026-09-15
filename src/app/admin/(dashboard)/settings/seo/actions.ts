"use server";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { revalidateTag } from "next/cache";
import { seoSettingsSchema, SEO_LOCALES } from "@/lib/seo";
export async function saveSeo(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.brand.edit");
    const config = seoSettingsSchema.parse({
      origin: form.get("origin"),
      indexingEnabled: form.get("indexingEnabled") === "on",
      googleVerification: form.get("googleVerification"),
      title: Object.fromEntries(
        SEO_LOCALES.map((locale) => [locale, form.get(`title_${locale}`)]),
      ),
      description: Object.fromEntries(
        SEO_LOCALES.map((locale) => [
          locale,
          form.get(`description_${locale}`),
        ]),
      ),
    });
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const current = await tx.siteSettings.findUniqueOrThrow({
          where: { id: "default" },
        });
        const before =
          current.seo &&
          typeof current.seo === "object" &&
          !Array.isArray(current.seo)
            ? current.seo
            : {};
        const after = { ...before, ...config };
        await tx.siteSettings.update({
          where: { id: "default" },
          data: { seo: after },
        });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "settings.seo.update",
            entityType: "SiteSettings",
            entityId: "default",
            before,
            after,
          },
        });
      }),
    );
    revalidateTag("site-settings");
  });
}
