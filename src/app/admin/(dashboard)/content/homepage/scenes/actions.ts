"use server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  saveHomepageDraft,
  publishHomepageRevision,
  scheduleHomepageRevision,
} from "@/modules/content/publication";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
async function actor(form: FormData, publication = false) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  let marketId: string | null;
  if (publication) {
    const row = await db.homepage.findFirst({
      where: { id: id.parse(form.get("homepageId")), deletedAt: null },
    });
    if (!row) throw new z.ZodError([]);
    marketId = row.marketId;
  } else
    marketId = id.nullable().parse(String(form.get("marketId") ?? "") || null);
  await assertCan(
    session.user.id,
    "content.homepage.write",
    marketId ? { marketId } : undefined,
  );
  // Domain writers repeat authorization after their real reference locks.
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
    const userId = await actor(form);
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
    const userId = await actor(form, true);
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
    const userId = await actor(form, true);
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
