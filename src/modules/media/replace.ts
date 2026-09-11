import sharp, { type Sharp } from "sharp";
import { db } from "@/lib/db";
import { storage, type StorageProvider } from "@/modules/integrations/storage";
import {
  JobDeferredError,
  registerJobHandler,
  type JobContext,
} from "@/modules/jobs";
import { MAX_JOB_ATTEMPTS } from "@/modules/jobs";
import { revalidatePath } from "next/cache";
import { isMaintenanceOn } from "@/modules/settings";
import type { Prisma } from "@prisma/client";
import {
  IMAGE_FORMATS,
  IMAGE_WIDTHS,
  MEDIA_REPLACE_JOB,
  type MediaVariants,
} from "./constants";

function variantKey(id: string, format: string, width: number) {
  return `media/replacements/${id}/${width}.${format}`;
}

async function blur(image: Sharp) {
  const value = await image.clone().resize(16).webp({ quality: 20 }).toBuffer();
  return `data:image/webp;base64,${value.toString("base64")}`;
}

async function color(image: Sharp) {
  const { data } = await image
    .clone()
    .resize(1, 1)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return `#${[data[0], data[1], data[2]]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function deleteVariants(variants: unknown, target: StorageProvider) {
  for (const widths of Object.values((variants as MediaVariants | null) ?? {}))
    for (const item of Object.values(widths ?? {}))
      if (item) await target.delete(item.key);
}

/**
 * Builds a complete replacement away from the live Media row, then swaps
 * storage metadata in one transaction. A cleanup failure leaves status
 * SWAPPED, so the normal job retry removes the old objects without swapping
 * again. A processing/stale failure leaves the original Media untouched.
 */
export async function mediaReplaceHandler(
  job: JobContext,
  target: StorageProvider = storage,
): Promise<void> {
  if (await isMaintenanceOn()) throw new JobDeferredError("maintenance is on");
  const { replacementId } = job.payload as { replacementId: string };
  const replacement = await db.mediaReplacement.findUniqueOrThrow({
    where: { id: replacementId },
  });
  const protectedMedia = await db.media.findUniqueOrThrow({
    where: { id: replacement.mediaId },
    select: { kind: true },
  });
  if (
    protectedMedia.kind === "invoice" ||
    protectedMedia.kind === "receipt" ||
    [
      replacement.storageKey,
      replacement.baseStorageKey,
      replacement.oldStorageKey,
    ].some(
      (key) => key?.startsWith("invoices/") || key?.startsWith("receipts/"),
    )
  )
    throw new Error("Financial media cannot be replaced");
  if (replacement.status === "DONE") {
    revalidateMediaPaths();
    return;
  }
  if (
    replacement.status === "SWAPPED" ||
    replacement.status === "CLEANUP_FAILED"
  ) {
    if (replacement.oldStorageKey)
      await target.delete(replacement.oldStorageKey);
    await deleteVariants(replacement.oldVariants, target);
    await db.mediaReplacement.update({
      where: { id: replacement.id },
      data: { status: "DONE", error: null },
    });
    revalidateMediaPaths();
    return;
  }

  await db.mediaReplacement.update({
    where: { id: replacement.id },
    data: { status: "PROCESSING", error: null },
  });
  const createdKeys: string[] = [];
  try {
    const bytes = await target.getBytes(replacement.storageKey);
    if (!bytes) throw new Error("replacement file missing from storage");
    const base = sharp(bytes).rotate();
    const metadata = await base.metadata();
    const originalWidth = metadata.width ?? 0;
    if (!originalWidth)
      throw new Error("could not read replacement dimensions");
    const widths: number[] = IMAGE_WIDTHS.filter(
      (width) => width <= originalWidth,
    );
    if (!widths.length) widths.push(originalWidth);
    const variants: MediaVariants = {};
    for (const format of IMAGE_FORMATS) {
      const values: Record<
        string,
        { key: string; url: string; bytes: number }
      > = {};
      for (const width of widths) {
        const resized = base
          .clone()
          .resize({ width, withoutEnlargement: true });
        const output =
          format === "webp"
            ? await resized.webp({ quality: 80 }).toBuffer()
            : await resized.avif({ quality: 60 }).toBuffer();
        const key = variantKey(replacement.id, format, width);
        values[String(width)] = {
          key,
          url: await target.put(key, output, `image/${format}`),
          bytes: output.length,
        };
        createdKeys.push(key);
      }
      variants[format] = values;
    }
    const [blurDataUrl, dominantColor] = await Promise.all([
      blur(base),
      color(base),
    ]);
    const old = await db.$transaction(async (tx) => {
      const current = await tx.media.findUniqueOrThrow({
        where: { id: replacement.mediaId },
      });
      if (current.storageKey !== replacement.baseStorageKey)
        throw new Error("stale media replacement");
      const updated = await tx.media.updateMany({
        where: {
          id: current.id,
          storageKey: replacement.baseStorageKey,
          deletedAt: null,
        },
        data: {
          storageKey: replacement.storageKey,
          url: replacement.url,
          originalName: replacement.originalName,
          bytes: replacement.bytes,
          mime: replacement.mime,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          variants,
          blurDataUrl,
          dominantColor,
          status: "READY",
          processingError: null,
        },
      });
      if (updated.count !== 1) throw new Error("stale media replacement");
      await tx.mediaReplacement.update({
        where: { id: replacement.id },
        data: {
          status: "SWAPPED",
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          variants,
          blurDataUrl,
          dominantColor,
          oldStorageKey: current.storageKey,
          oldVariants: current.variants as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: replacement.requestedBy,
          action: "media.replace",
          entityType: "Media",
          entityId: current.id,
          before: {
            storageKey: current.storageKey,
            mime: current.mime,
            bytes: current.bytes,
          },
          after: {
            storageKey: replacement.storageKey,
            mime: replacement.mime,
            bytes: replacement.bytes,
          },
        },
      });
      return current;
    });
    await target.delete(old.storageKey);
    await deleteVariants(old.variants, target);
    await db.mediaReplacement.update({
      where: { id: replacement.id },
      data: { status: "DONE", error: null },
    });
    revalidateMediaPaths();
  } catch (error) {
    const current = await db.mediaReplacement.findUnique({
      where: { id: replacement.id },
    });
    if (current?.status === "SWAPPED" || current?.status === "CLEANUP_FAILED") {
      if (
        current.status === "CLEANUP_FAILED" ||
        job.attempts + 1 >= MAX_JOB_ATTEMPTS
      )
        await db.mediaReplacement.update({
          where: { id: replacement.id },
          data: {
            status: "CLEANUP_FAILED",
            error: (error instanceof Error ? error.message : "unknown").slice(
              0,
              1000,
            ),
          },
        });
    } else if (current?.status !== "DONE") {
      await Promise.all(
        createdKeys.map((key) => target.delete(key).catch(() => {})),
      );
      await db.mediaReplacement.update({
        where: { id: replacement.id },
        data: {
          status:
            job.attempts + 1 >= MAX_JOB_ATTEMPTS ? "FAILED" : "PROCESSING",
          error: (error instanceof Error ? error.message : "unknown").slice(
            0,
            1000,
          ),
        },
      });
    }
    throw error;
  }
}

function revalidateMediaPaths() {
  revalidatePath("/admin/media");
  revalidatePath("/fa", "layout");
  revalidatePath("/tr", "layout");
  revalidatePath("/en", "layout");
}

export function registerMediaReplaceHandler() {
  registerJobHandler(MEDIA_REPLACE_JOB, mediaReplaceHandler);
}
