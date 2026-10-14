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
export type HomepageSaveResult = ActionResult & {
  savedVersion?: number;
  savedRevisionId?: string;
  draftSaved?: boolean;
};
export async function saveHomepage(
  _previous: ActionResult | null,
  data: FormData,
): Promise<HomepageSaveResult> {
  let saved: Awaited<ReturnType<typeof saveHomepageDraft>> | undefined;
  const result = await runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const marketId =
      z
        .string()
        .regex(/^(?:[A-Za-z0-9_-]{1,100})?$/)
        .parse(data.get("marketId") ?? "") || null;
    await assertCan(
      session.user.id,
      "content.homepage.write",
      marketId ? { marketId } : undefined,
    );
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
    let expectedSceneFingerprints: unknown;
    try {
      expectedSceneFingerprints = JSON.parse(
        String(data.get("expectedSceneFingerprints") ?? "[]"),
      );
    } catch {
      throw new z.ZodError([]);
    }
    saved = await saveHomepageDraft(session.user.id, {
      marketId,
      expectedVersion,
      blocks,
      confirmSceneIds: data.getAll("confirmSceneIds").map(String),
      expectedSceneFingerprints,
    });
    try {
      if (intent === "PUBLISH")
        await publishHomepageRevision(session.user.id, {
          homepageId: saved.id,
          revisionId: saved.revisionId,
          expectedVersion: saved.version,
        });
    } finally {
      revalidateTag("homepage");
      revalidatePath("/admin/content/homepage");
      revalidatePath("/admin/content/homepage/scenes");
    }
  });
  return saved
    ? {
        ...result,
        savedVersion: saved.version,
        savedRevisionId: saved.revisionId,
        draftSaved: true,
      }
    : result;
}
