import crypto from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, ForbiddenError } from "@/modules/access";
import { db } from "@/lib/db";
import { enterRequest, leaveRequest } from "@/lib/request-metrics";
import { isMaintenanceOn } from "@/modules/settings";
import { storage } from "@/modules/integrations/storage";
import {
  ALLOWED_MIME,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MEDIA_REPLACE_JOB,
  RASTER_MIME,
} from "@/modules/media/constants";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    await assertCan(session.user.id, "media.write");
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw error;
  }
  enterRequest();
  try {
    if (await isMaintenanceOn())
      return NextResponse.json({ error: "maintenance" }, { status: 503 });
    const { id } = z
      .object({ id: z.string().min(1).max(100) })
      .parse(await params);
    const media = await db.media.findFirst({
      where: { id, kind: "image", deletedAt: null, status: "READY" },
    });
    if (!media)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const active = await db.mediaReplacement.findFirst({
      where: {
        mediaId: id,
        status: { in: ["PENDING", "PROCESSING", "SWAPPED", "CLEANUP_FAILED"] },
      },
    });
    if (active)
      return NextResponse.json(
        { error: "replacement_active" },
        { status: 409 },
      );
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE_BYTES)
      return NextResponse.json({ error: "invalid_size" }, { status: 400 });
    const originalName = z.string().trim().min(1).max(255).parse(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = await fileTypeFromBuffer(buffer);
    const allowed = sniffed && ALLOWED_MIME[sniffed.mime];
    if (!allowed || !RASTER_MIME.has(sniffed.mime))
      return NextResponse.json(
        { error: "unsupported_media_type" },
        { status: 415 },
      );
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      return NextResponse.json({ error: "corrupt_file" }, { status: 400 });
    }
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION
    )
      return NextResponse.json(
        { error: "dimensions_too_large" },
        { status: 400 },
      );
    const now = new Date();
    const key = `media/replacements/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${allowed.ext}`;
    const url = await storage.put(key, buffer, sniffed.mime);
    try {
      const replacement = await db.$transaction(async (tx) => {
        const created = await tx.mediaReplacement.create({
          data: {
            mediaId: media.id,
            baseStorageKey: media.storageKey,
            storageKey: key,
            url,
            originalName,
            bytes: file.size,
            mime: sniffed.mime,
            width: metadata.width,
            height: metadata.height,
            requestedBy: session.user.id,
          },
        });
        await tx.job.create({
          data: {
            type: MEDIA_REPLACE_JOB,
            payload: { replacementId: created.id },
          },
        });
        return created;
      });
      return NextResponse.json(
        { id: replacement.id, mediaId: media.id, status: replacement.status },
        { status: 202 },
      );
    } catch (error) {
      await storage.delete(key).catch(() => {});
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "P2002"
      )
        return NextResponse.json(
          { error: "replacement_active" },
          { status: 409 },
        );
      throw error;
    }
  } finally {
    leaveRequest();
  }
}
