"use server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  saveHomepageDraft,
  publishHomepageRevision,
  scheduleHomepageRevision,
} from "@/modules/content/publication";
import { revalidatePath, revalidateTag } from "next/cache";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
async function actor() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}
function json(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value ?? "")) as unknown;
  } catch {
    throw new z.ZodError([]);
  }
}
function invalidate() {
  revalidateTag("homepage");
  revalidatePath("/admin/content/homepage/scenes");
  revalidatePath("/admin/content/homepage");
}
export async function saveSceneDraft(_: ActionResult | null, form: FormData) {
  return runAction(async () => {
    const userId = await actor();
    await saveHomepageDraft(userId, {
      marketId: String(form.get("marketId") ?? "") || null,
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .parse(form.get("expectedVersion")),
      blocks: json(form.get("blocks")),
      confirmSceneIds: form.getAll("confirmSceneIds").map(String),
    });
    invalidate();
  });
}
export async function publishSceneRevision(
  _: ActionResult | null,
  form: FormData,
) {
  return runAction(async () => {
    const userId = await actor();
    await publishHomepageRevision(userId, {
      homepageId: id.parse(form.get("homepageId")),
      revisionId: id.parse(form.get("revisionId")),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .parse(form.get("expectedVersion")),
    });
    invalidate();
  });
}
export async function scheduleSceneRevision(
  _: ActionResult | null,
  form: FormData,
) {
  return runAction(async () => {
    const userId = await actor();
    const at = z.string().datetime().parse(form.get("at"));
    await scheduleHomepageRevision(userId, {
      homepageId: id.parse(form.get("homepageId")),
      revisionId: id.parse(form.get("revisionId")),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .parse(form.get("expectedVersion")),
      at: new Date(at),
    });
    invalidate();
  });
}
