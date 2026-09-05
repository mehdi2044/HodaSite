import { NextResponse } from "next/server";
import crypto from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { storage } from "@/modules/integrations/storage";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { isMaintenanceOn } from "@/modules/settings";
import { enterRequest, leaveRequest } from "@/lib/request-metrics";
import { imageProcessingQueue } from "@/modules/media/queue";
import {
  ALLOWED_MIME,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_PDF_BYTES,
} from "@/modules/media/constants";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await can(session.user.id, "media.upload")))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Count first, then check maintenance — same ordering as withMutation so a
  // restore drain can never miss this request (A8, Vee).
  enterRequest();
  try {
    if (await isMaintenanceOn())
      return NextResponse.json({ error: "maintenance" }, { status: 503 });

    const file = (await req.formData()).get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "invalid_file" }, { status: 400 });
    if (file.size === 0)
      return NextResponse.json({ error: "invalid_size" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Trust the bytes, not the client-supplied file.type (D40).
    const sniffed = await fileTypeFromBuffer(buffer);
    const allowed = sniffed && ALLOWED_MIME[sniffed.mime];
    if (!allowed)
      return NextResponse.json(
        { error: "unsupported_media_type" },
        { status: 415 },
      );

    const maxBytes = allowed.kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
    if (file.size > maxBytes)
      return NextResponse.json({ error: "invalid_size" }, { status: 400 });

    let width: number | null = null;
    let height: number | null = null;
    if (allowed.kind === "image") {
      try {
        const metadata = await sharp(buffer).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
      } catch {
        return NextResponse.json({ error: "corrupt_file" }, { status: 400 });
      }
      if (
        !width ||
        !height ||
        width > MAX_IMAGE_DIMENSION ||
        height > MAX_IMAGE_DIMENSION
      )
        return NextResponse.json(
          { error: "dimensions_too_large" },
          { status: 400 },
        );
    }

    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}/${crypto.randomUUID()}.${allowed.ext}`;

    const url = await storage.put(key, buffer, sniffed.mime);
    // Images go PROCESSING -> media-optimize job -> READY; documents (pdf)
    // need no processing and are READY immediately (Phase 01b §2).
    const media = await db.media.create({
      data: {
        kind: allowed.kind,
        storageKey: key,
        originalName: file.name, // metadata only, never used as a path
        url,
        width,
        height,
        bytes: file.size,
        mime: sniffed.mime,
        uploadedBy: session.user.id,
        status: allowed.kind === "image" ? "PROCESSING" : "READY",
      },
    });

    if (allowed.kind === "image") await imageProcessingQueue.enqueue(media.id);

    return NextResponse.json(
      { id: media.id, url, status: media.status },
      { status: 202 },
    );
  } finally {
    leaveRequest();
  }
}
