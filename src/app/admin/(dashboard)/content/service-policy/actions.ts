"use server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  saveServicePolicy,
  SERVICE_KEYS,
} from "@/modules/content/service-policy";
import { revalidateTag, revalidatePath } from "next/cache";
export async function savePolicy(_: ActionResult | null, form: FormData) {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const copy = Object.fromEntries(
      SERVICE_KEYS.map((key) => [
        key,
        {
          title: Object.fromEntries(
            ["fa", "tr", "en"].map((locale) => [
              locale,
              String(form.get(`${key}Title_${locale}`) ?? ""),
            ]),
          ),
          body: Object.fromEntries(
            ["fa", "tr", "en"].map((locale) => [
              locale,
              String(form.get(`${key}Body_${locale}`) ?? ""),
            ]),
          ),
        },
      ]),
    );
    await saveServicePolicy(session.user.id, {
      marketId: form.get("marketId"),
      expectedRevision: z.coerce.number().int().parse(form.get("revision")),
      policy: {
        version: 1,
        announcement: form.get("announcement") === "on",
        shippingRuleIds: form.getAll("shippingRuleId"),
        faqPageId: String(form.get("faqPageId") ?? "") || undefined,
        ...copy,
      },
    });
    revalidateTag("markets");
    revalidatePath("/admin/content/service-policy");
  });
}
