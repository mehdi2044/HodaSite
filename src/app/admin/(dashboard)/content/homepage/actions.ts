"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  saveHomepageDraft,
  publishHomepageRevision,
} from "@/modules/content/publication";
export async function saveHomepage(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    // This legacy all-market builder remains global-only; the new scene editor
    // exposes actual per-market scopes without broadening its old read contract.
    await assertCan(session.user.id, "content.homepage.write");
    const marketId =
      z
        .string()
        .max(100)
        .parse(data.get("marketId") ?? "") || null;
    const expectedVersion = z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .parse(data.get("expectedVersion"));
    const intent = z
      .enum(["DRAFT", "PUBLISH"])
      .parse(data.get("intent") ?? "DRAFT");
    let blocks: unknown;
    try {
      blocks = JSON.parse(String(data.get("blocks") ?? "[]"));
    } catch {
      throw new z.ZodError([]);
    }
    const saved = await saveHomepageDraft(session.user.id, {
      marketId,
      expectedVersion,
      blocks,
    });
    if (intent === "PUBLISH")
      await publishHomepageRevision(session.user.id, {
        homepageId: saved.id,
        revisionId: saved.revisionId,
        expectedVersion: saved.version,
      });
    revalidateTag("homepage");
    revalidatePath("/admin/content/homepage");
    revalidatePath("/admin/content/homepage/scenes");
  });
}
