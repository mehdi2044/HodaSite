"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { homepageBlocksSchema } from "@/modules/content/homepage";

export async function saveHomepage(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "content.homepage.write");
    const marketId =
      z
        .string()
        .max(100)
        .parse(data.get("marketId") ?? "") || null;
    const blocks = homepageBlocksSchema.parse(
      parseJson(String(data.get("blocks") ?? "[]")),
    );
    if (marketId && !(await db.market.findUnique({ where: { id: marketId } })))
      throw new z.ZodError([]);

    const mediaIds = [
      ...new Set(
        blocks.flatMap((block) =>
          (block.type === "Hero" || block.type === "Banner") && block.mediaId
            ? [block.mediaId]
            : [],
        ),
      ),
    ];
    if (mediaIds.length) {
      const count = await db.media.count({
        where: {
          id: { in: mediaIds },
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      });
      if (count !== mediaIds.length) throw new z.ZodError([]);
    }

    const before = await db.homepage.findFirst({
      where: { marketId, deletedAt: null },
    });
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const saved = before
          ? await tx.homepage.update({
              where: { id: before.id },
              data: { blocks },
            })
          : await tx.homepage.create({ data: { marketId, blocks } });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: before
              ? "content.homepage.update"
              : "content.homepage.create",
            entityType: "Homepage",
            entityId: saved.id,
            before: before as object | undefined,
            after: saved as object,
          },
        });
      }),
    );
    revalidateTag("homepage");
    revalidatePath("/admin/content/homepage");
    revalidatePath("/fa");
    revalidatePath("/tr");
    revalidatePath("/en");
  });
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
