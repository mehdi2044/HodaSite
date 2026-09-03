import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { storage } from "@/modules/integrations/storage";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { isMaintenanceOn } from "@/modules/settings";
import { enterRequest, leaveRequest } from "@/lib/request-metrics";

const MAX_BYTES = 5_000_000;

// Allow-list keyed by the *sniffed* MIME. The stored extension comes from
// here, never from the uploaded filename (D40).
const ALLOWED: Record<string, { ext: string; kind: string }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/avif": { ext: "avif", kind: "image" },
  "application/pdf": { ext: "pdf", kind: "document" },
};

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
    if (file.size === 0 || file.size > MAX_BYTES)
      return NextResponse.json({ error: "invalid_size" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Trust the bytes, not the client-supplied file.type.
    const sniffed = await fileTypeFromBuffer(buffer);
    const allowed = sniffed && ALLOWED[sniffed.mime];
    if (!allowed)
      return NextResponse.json(
        { error: "unsupported_media_type" },
        { status: 415 },
      );

    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}/${crypto.randomUUID()}.${allowed.ext}`;

    const url = await storage.put(key, buffer, sniffed.mime);
    const media = await db.media.create({
      data: {
        kind: allowed.kind,
        storageKey: key,
        originalName: file.name, // metadata only, never used as a path
        url,
        bytes: file.size,
        mime: sniffed.mime,
        uploadedBy: session.user.id,
      },
    });
    return NextResponse.json({ id: media.id, url }, { status: 201 });
  } finally {
    leaveRequest();
  }
}
