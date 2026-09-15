"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { runAction } from "@/lib/action-result";
import { moderateReview } from "@/modules/engagement";
export async function moderateReviewAction(_: unknown, form: FormData) {
  return runAction(async () => {
    const s = await auth();
    if (!s?.user?.id) throw new UnauthorizedError();
    await assertCan(s.user.id, "content.page.publish");
    await moderateReview(s.user.id, Object.fromEntries(form));
    revalidatePath("/admin/content/reviews");
  });
}
