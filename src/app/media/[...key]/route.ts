import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import type { MediaVariants } from "@/modules/media/constants";

// Streams objects through the provider for both local disk and S3-compatible
// storage. In particular, never redirect browsers to the compose-internal
// MinIO hostname; a future public CDN can shortcut this route at Caddy.
const PRIVATE_KINDS = new Set(["receipt", "backup"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const storageKey = key.join("/");

  const variantMatch = storageKey.match(
    /^media\/variants\/([^/]+)\/\d+\.(webp|avif)$/,
  );
  const media = variantMatch
    ? await db.media.findUnique({ where: { id: variantMatch[1] } })
    : await db.media.findUnique({ where: { storageKey } });
  if (!media || media.deletedAt) return new NextResponse(null, { status: 404 });

  const isVariant = Boolean(variantMatch);
  if (isVariant) {
    const variants = (media.variants as MediaVariants | null) ?? {};
    const knownKeys = Object.values(variants).flatMap((byWidth) =>
      Object.values(byWidth ?? {}).flatMap((variant) =>
        variant ? [variant.key] : [],
      ),
    );
    if (!knownKeys.includes(storageKey))
      return new NextResponse(null, { status: 404 });
  }

  const isPrivate = PRIVATE_KINDS.has(media.kind);
  if (isPrivate) {
    const session = await auth();
    if (!session?.user?.id || !(await can(session.user.id, "media.upload")))
      // Don't reveal that the object exists.
      return new NextResponse(null, { status: 404 });
  }

  const bytes = await storage.getBytes(storageKey);
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": variantMatch ? `image/${variantMatch[2]}` : media.mime,
      "content-length": String(bytes.length),
      "cache-control": isPrivate
        ? "private, no-store"
        : isVariant
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
    },
  });
}
