import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";

// Serves files written by LocalStorage (fix-order B10). In production with
// STORAGE_PROVIDER=s3 this redirects to a short-lived presigned URL; a Caddy
// rule can shortcut public media entirely.
const PRIVATE_KINDS = new Set(["receipt", "backup"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const storageKey = key.join("/");

  const media = await db.media.findUnique({ where: { storageKey } });
  if (!media || media.deletedAt) return new NextResponse(null, { status: 404 });

  const isPrivate = PRIVATE_KINDS.has(media.kind);
  if (isPrivate) {
    const session = await auth();
    if (!session?.user?.id || !(await can(session.user.id, "media.upload")))
      // Don't reveal that the object exists.
      return new NextResponse(null, { status: 404 });
  }

  if (process.env.STORAGE_PROVIDER === "s3") {
    return NextResponse.redirect(await storage.getSignedUrl(storageKey));
  }

  const bytes = await storage.getBytes(storageKey);
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": media.mime,
      "content-length": String(bytes.length),
      "cache-control": isPrivate
        ? "private, no-store"
        : "public, max-age=31536000, immutable",
    },
  });
}
