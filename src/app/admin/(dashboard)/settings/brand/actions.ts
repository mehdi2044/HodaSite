"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";

const schema = z.object({
  fa: z.string().min(1),
  tr: z.string().min(1),
  en: z.string().min(1),
});

export async function saveBrand(data: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await assertCan(session.user.id, "settings.brand.edit");
  const userId = session.user.id;

  const brand = schema.parse(Object.fromEntries(data));

  await withMutation(async () => {
    const current = await db.siteSettings.findUnique({
      where: { id: "default" },
    });
    await db.$transaction([
      db.siteSettings.update({ where: { id: "default" }, data: { brand } }),
      db.auditLog.create({
        data: {
          userId,
          action: "settings.brand.update",
          entityType: "SiteSettings",
          entityId: "default",
          before: (current?.brand ?? undefined) as object | undefined,
          after: brand,
        },
      }),
    ]);
  });

  revalidatePath("/", "layout");
}
