"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { imageProcessingQueue } from "@/modules/media/queue";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

function audit(
  userId: string,
  action: string,
  entityId: string,
  before: object,
  after: object,
) {
  return db.auditLog.create({
    data: { userId, action, entityType: "Media", entityId, before, after },
  });
}

const updateSchema = z.object({
  mediaId: z.string().min(1),
  altFa: z.string().optional().default(""),
  altTr: z.string().optional().default(""),
  altEn: z.string().optional().default(""),
  tags: z.string().optional().default(""),
  folderId: z.string().optional().default(""),
});

export async function updateMediaMeta(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.write");
  const parsed = updateSchema.parse(Object.fromEntries(formData));
  const tags = parsed.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await withMutation(async () => {
    const before = await db.media.findUniqueOrThrow({
      where: { id: parsed.mediaId },
    });
    const after = await db.media.update({
      where: { id: parsed.mediaId },
      data: {
        altI18n: { fa: parsed.altFa, tr: parsed.altTr, en: parsed.altEn },
        tags,
        folderId: parsed.folderId || null,
      },
    });
    await audit(userId, "media.update", parsed.mediaId, before, after);
  });

  revalidatePath("/admin/media");
}

const idSchema = z.object({ mediaId: z.string().min(1) });

export async function softDeleteMediaAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.delete");
  const { mediaId } = idSchema.parse(Object.fromEntries(formData));

  await withMutation(async () => {
    const before = await db.media.findUniqueOrThrow({ where: { id: mediaId } });
    const after = await db.media.update({
      where: { id: mediaId },
      data: { deletedAt: new Date() },
    });
    await audit(userId, "media.delete", mediaId, before, after);
  });

  revalidatePath("/admin/media");
}

export async function restoreMediaAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.delete");
  const { mediaId } = idSchema.parse(Object.fromEntries(formData));

  await withMutation(async () => {
    const before = await db.media.findUniqueOrThrow({ where: { id: mediaId } });
    const after = await db.media.update({
      where: { id: mediaId },
      data: { deletedAt: null },
    });
    await audit(userId, "media.restore", mediaId, before, after);
  });

  revalidatePath("/admin/media");
}

export async function retryProcessingAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.write");
  const { mediaId } = idSchema.parse(Object.fromEntries(formData));

  await withMutation(async () => {
    await imageProcessingQueue.enqueueRetry(mediaId);
  });

  revalidatePath("/admin/media");
}

const folderSchema = z.object({ name: z.string().min(1) });

export async function createFolderAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.write");
  const { name } = folderSchema.parse(Object.fromEntries(formData));

  await withMutation(async () => {
    await db.mediaFolder.create({ data: { name } });
  });

  revalidatePath("/admin/media");
}

const bulkSchema = z.object({
  ids: z.string().min(1),
  folderId: z.string().optional().default(""),
});

export async function bulkMoveAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.write");
  const { ids, folderId } = bulkSchema.parse(Object.fromEntries(formData));
  const mediaIds = ids.split(",").filter(Boolean);

  await withMutation(async () => {
    await db.media.updateMany({
      where: { id: { in: mediaIds } },
      data: { folderId: folderId || null },
    });
    await audit(
      userId,
      "media.bulk_move",
      mediaIds.join(","),
      {},
      { folderId },
    );
  });

  revalidatePath("/admin/media");
}

const bulkTagSchema = z.object({
  ids: z.string().min(1),
  tag: z.string().min(1),
});

export async function bulkTagAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.write");
  const { ids, tag } = bulkTagSchema.parse(Object.fromEntries(formData));
  const mediaIds = ids.split(",").filter(Boolean);

  await withMutation(async () => {
    const rows = await db.media.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, tags: true },
    });
    await db.$transaction(
      rows
        .filter((r) => !r.tags.includes(tag))
        .map((r) =>
          db.media.update({
            where: { id: r.id },
            data: { tags: [...r.tags, tag] },
          }),
        ),
    );
    await audit(userId, "media.bulk_tag", mediaIds.join(","), {}, { tag });
  });

  revalidatePath("/admin/media");
}

const bulkIdsSchema = z.object({ ids: z.string().min(1) });

export async function bulkDeleteAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  await assertCan(userId, "media.delete");
  const { ids } = bulkIdsSchema.parse(Object.fromEntries(formData));
  const mediaIds = ids.split(",").filter(Boolean);

  await withMutation(async () => {
    await db.media.updateMany({
      where: { id: { in: mediaIds } },
      data: { deletedAt: new Date() },
    });
    await audit(userId, "media.bulk_delete", mediaIds.join(","), {}, {});
  });

  revalidatePath("/admin/media");
}
