"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export async function saveTheme(data: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await assertCan(session.user.id, "settings.theme.edit");

  const primary = hex.parse(data.get("primary"));
  const current = await db.themeSettings.findUniqueOrThrow({
    where: { id: "default" },
  });
  await db.$transaction([
    db.themeSettings.update({
      where: { id: "default" },
      data: { colors: { ...(current.colors as object), primary } },
    }),
    db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "settings.theme.update",
        entityType: "ThemeSettings",
        entityId: "default",
        before: { primary: (current.colors as Record<string, string>).primary },
        after: { primary },
      },
    }),
  ]);
  revalidatePath("/", "layout");
}
