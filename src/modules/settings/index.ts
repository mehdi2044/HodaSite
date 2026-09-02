import { db } from "@/lib/db";
export async function getAppearance() {
  try {
    return await Promise.all([
      db.siteSettings.findUnique({ where: { id: "default" } }),
      db.themeSettings.findUnique({ where: { id: "default" } }),
    ]);
  } catch {
    return [null, null] as const;
  }
}
