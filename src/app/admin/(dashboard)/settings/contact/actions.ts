"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  email: z.string().email().or(z.literal("")),
  phoneIR: z.string().optional().default(""),
  phoneTR: z.string().optional().default(""),
  phoneCA: z.string().optional().default(""),
  addressFa: z.string().optional().default(""),
  addressTr: z.string().optional().default(""),
  addressEn: z.string().optional().default(""),
  hoursFa: z.string().optional().default(""),
  hoursTr: z.string().optional().default(""),
  hoursEn: z.string().optional().default(""),
});

export async function saveContact(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.contact.edit");
    const userId = session.user.id;

    const parsed = schema.parse(Object.fromEntries(data));
    const contact = {
      email: parsed.email,
      phones: { IR: parsed.phoneIR, TR: parsed.phoneTR, CA: parsed.phoneCA },
      address: {
        fa: parsed.addressFa,
        tr: parsed.addressTr,
        en: parsed.addressEn,
      },
      hours: { fa: parsed.hoursFa, tr: parsed.hoursTr, en: parsed.hoursEn },
    };

    await withMutation(async () => {
      const current = await db.siteSettings.findUnique({
        where: { id: "default" },
      });
      await db.$transaction([
        db.siteSettings.update({ where: { id: "default" }, data: { contact } }),
        db.auditLog.create({
          data: {
            userId,
            action: "settings.contact.update",
            entityType: "SiteSettings",
            entityId: "default",
            before: (current?.contact ?? undefined) as object | undefined,
            after: contact,
          },
        }),
      ]);
    });

    revalidateTag("site-settings");
  });
}
