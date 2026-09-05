"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  companyName: z.string().optional().default(""),
  registrationNo: z.string().optional().default(""),
  taxNo: z.string().optional().default(""),
  footerLineFa: z.string().optional().default(""),
  footerLineTr: z.string().optional().default(""),
  footerLineEn: z.string().optional().default(""),
});

export async function saveLegal(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.legal.edit");
    const userId = session.user.id;

    const parsed = schema.parse(Object.fromEntries(data));
    const legal = {
      companyName: parsed.companyName,
      registrationNo: parsed.registrationNo,
      taxNo: parsed.taxNo,
      footerLine: {
        fa: parsed.footerLineFa,
        tr: parsed.footerLineTr,
        en: parsed.footerLineEn,
      },
    };

    await withMutation(async () => {
      const current = await db.siteSettings.findUnique({
        where: { id: "default" },
      });
      await db.$transaction([
        db.siteSettings.update({ where: { id: "default" }, data: { legal } }),
        db.auditLog.create({
          data: {
            userId,
            action: "settings.legal.update",
            entityType: "SiteSettings",
            entityId: "default",
            before: (current?.legal ?? undefined) as object | undefined,
            after: legal,
          },
        }),
      ]);
    });

    revalidateTag("site-settings");
  });
}
