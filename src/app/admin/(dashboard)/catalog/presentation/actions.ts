"use server";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import { saveCategoryPresentation } from "@/modules/catalog/category-presentation";
import { revalidatePath, revalidateTag } from "next/cache";
export async function savePresentationAction(
  _: ActionResult | null,
  form: FormData,
) {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "catalog.product.edit");
    const kind = String(form.get("presentationKind") ?? "inherit");
    await saveCategoryPresentation(session.user.id, {
      id: form.get("id"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
      presentation:
        kind === "inherit"
          ? null
          : { version: 1, kind, tone: form.get("tone") },
    });
    revalidateTag("catalog");
    revalidateTag("homepage");
    revalidatePath("/admin/catalog/presentation");
  });
}
