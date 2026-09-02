"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export async function saveTheme(data: FormData) {
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
        action: "settings.theme.update",
        entityType: "ThemeSettings",
        entityId: "default",
        after: { primary },
      },
    }),
  ]);
  revalidatePath("/", "layout");
}
