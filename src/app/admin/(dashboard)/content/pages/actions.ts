"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { pageInputSchema } from "@/modules/content";

export async function savePage(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const status = String(data.get("status") || "draft");
    await assertCan(
      session.user.id,
      status === "published" ? "content.page.publish" : "content.page.write",
    );
    const input = pageInputSchema.parse({
      id: String(data.get("id") || "") || undefined,
      titleI18n: localized(data, "title"),
      slugI18n: localized(data, "slug"),
      type: String(data.get("type") || "static"),
      status,
      marketIds: data.getAll("marketIds").map(String),
      seoI18n: {
        title: localized(data, "seoTitle"),
        description: localized(data, "seoDescription"),
      },
      blocks: parseJson(String(data.get("blocks") || "[]")),
    });

    const pages = await db.page.findMany({
      where: {
        deletedAt: null,
        ...(input.id ? { id: { not: input.id } } : {}),
      },
      select: { slugI18n: true },
    });
    if (
      pages.some((page) => {
        const slugs = page.slugI18n as Record<string, string>;
        return Object.entries(input.slugI18n).some(
          ([locale, slug]) => slugs[locale] === slug,
        );
      })
    )
      throw new z.ZodError([]);

    if (input.marketIds.length > 0) {
      const validMarkets = await db.market.count({
        where: { id: { in: input.marketIds } },
      });
      if (validMarkets !== input.marketIds.length) throw new z.ZodError([]);
    }

    const current = input.id
      ? await db.page.findFirst({ where: { id: input.id, deletedAt: null } })
      : null;
    if (input.id && !current) throw new z.ZodError([]);
    if (current?.status === "published" && input.status !== "published")
      await assertCan(session.user.id, "content.page.publish");

    const requestedMediaIds = input.blocks.flatMap((block) =>
      (block.type === "Image" || block.type === "Hero") && block.mediaId
        ? [block.mediaId]
        : [],
    );
    if (requestedMediaIds.length > 0) {
      const uniqueMediaIds = [...new Set(requestedMediaIds)];
      const validImages = await db.media.count({
        where: {
          id: { in: uniqueMediaIds },
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      });
      if (validImages !== uniqueMediaIds.length) throw new z.ZodError([]);
    }
    const saved = await withMutation(() =>
      db.$transaction(async (tx) => {
        const page = input.id
          ? await tx.page.update({
              where: { id: input.id },
              data: pageData(input),
            })
          : await tx.page.create({ data: pageData(input) });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: input.id ? "content.page.update" : "content.page.create",
            entityType: "Page",
            entityId: page.id,
            before: current as object | undefined,
            after: page as object,
          },
        });
        return page;
      }),
    );
    revalidateTag("pages");
    revalidateTag("menus");
    revalidatePath("/admin/content/pages");
    revalidatePath(`/admin/content/pages/${saved.id}`);
  });
}

export async function duplicatePage(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "content.page.write");
    const id = z.string().min(1).parse(data.get("id"));
    const original = await db.page.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
    const suffix = Date.now().toString(36);
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const copy = await tx.page.create({
          data: {
            slugI18n: Object.fromEntries(
              Object.entries(original.slugI18n as Record<string, string>).map(
                ([key, value]) => [key, `${value}-${suffix}`],
              ),
            ),
            titleI18n: original.titleI18n as object,
            type: original.type,
            status: "draft",
            seoI18n: original.seoI18n as object,
            marketIds: original.marketIds,
            blocks: original.blocks as object,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "content.page.duplicate",
            entityType: "Page",
            entityId: copy.id,
            after: { sourceId: original.id },
          },
        });
      }),
    );
    revalidateTag("pages");
    revalidatePath("/admin/content/pages");
  });
}

export async function setPageDeleted(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "content.page.delete");
    const parsed = z
      .object({ id: z.string().min(1), restore: z.boolean() })
      .parse({
        id: data.get("id"),
        restore: data.get("restore") === "true",
      });
    const before = await db.page.findUniqueOrThrow({
      where: { id: parsed.id },
    });
    if (parsed.restore) {
      const activePages = await db.page.findMany({
        where: { id: { not: parsed.id }, deletedAt: null },
        select: { slugI18n: true },
      });
      const restoredSlugs = before.slugI18n as Record<string, string>;
      if (
        activePages.some((page) => {
          const activeSlugs = page.slugI18n as Record<string, string>;
          return Object.keys(restoredSlugs).some(
            (locale) => activeSlugs[locale] === restoredSlugs[locale],
          );
        })
      )
        throw new z.ZodError([]);
    }
    await withMutation(() =>
      db.$transaction([
        db.page.update({
          where: { id: parsed.id },
          data: {
            deletedAt: parsed.restore ? null : new Date(),
            status: parsed.restore ? before.status : "draft",
          },
        }),
        db.auditLog.create({
          data: {
            userId: session.user.id,
            action: parsed.restore
              ? "content.page.restore"
              : "content.page.delete",
            entityType: "Page",
            entityId: parsed.id,
            before: before as object,
          },
        }),
      ]),
    );
    revalidateTag("pages");
    revalidateTag("menus");
    revalidatePath("/admin/content/pages");
  });
}

function localized(data: FormData, prefix: string) {
  return {
    fa: String(data.get(`${prefix}Fa`) || ""),
    tr: String(data.get(`${prefix}Tr`) || ""),
    en: String(data.get(`${prefix}En`) || ""),
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function pageData(input: z.infer<typeof pageInputSchema>) {
  return {
    titleI18n: input.titleI18n,
    slugI18n: input.slugI18n,
    type: input.type,
    status: input.status,
    marketIds: input.marketIds,
    seoI18n: input.seoI18n,
    blocks: input.blocks,
  };
}
