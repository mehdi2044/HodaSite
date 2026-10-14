"use server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  saveCatalogCutout,
  archiveCatalogCutout,
} from "@/modules/catalog/cutouts/service";
import { revalidatePath, revalidateTag } from "next/cache";
async function actor() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  await assertCan(session.user.id, "catalog.product.edit");
  return session.user.id;
}
export async function saveCutoutAction(_: ActionResult | null, form: FormData) {
  return runAction(async () => {
    const userId = await actor();
    let payload: unknown;
    try {
      payload = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      throw new z.ZodError([]);
    }
    await saveCatalogCutout(userId, payload);
    revalidateTag("catalog");
    revalidateTag("homepage");
    revalidatePath("/admin/catalog/cutouts");
  });
}
export async function archiveCutoutAction(
  _: ActionResult | null,
  form: FormData,
) {
  return runAction(async () => {
    const userId = await actor();
    const id = z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .parse(form.get("id"));
    const version = z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .parse(form.get("expectedVersion"));
    await archiveCatalogCutout(userId, id, version);
    revalidateTag("catalog");
    revalidateTag("homepage");
    revalidatePath("/admin/catalog/cutouts");
  });
}
