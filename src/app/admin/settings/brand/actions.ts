"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
const schema = z.object({
  fa: z.string().min(1),
  tr: z.string().min(1),
  en: z.string().min(1),
});
export async function saveBrand(data: FormData) {
  const brand = schema.parse(Object.fromEntries(data));
  await db.siteSettings.update({ where: { id: "default" }, data: { brand } });
  revalidatePath("/", "layout");
}
