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

  const legacyVariantMatch = storageKey.match(
    /^media\/variants\/([^/]+)\/\d+\.(webp|avif)$/,
  );
  const replacementVariantMatch = storageKey.match(
    /^media\/replacements\/([^/]+)\/\d+\.(webp|avif)$/,
  );
  // Read the early MODA4 seed's persisted sibling keys without rewriting
  // retained Media. New seeds use the existing media/variants convention.
  const siblingVariantMatch = storageKey.match(
    /^(media\/\d{4}\/\d{2}\/[a-f0-9-]{36})-(320|640|960)\.(webp)$/,
  );
  const replacement = replacementVariantMatch
    ? await db.mediaReplacement.findUnique({
        where: { id: replacementVariantMatch[1] },
        include: { media: true },
      })
    : null;
  const media = legacyVariantMatch
    ? await db.media.findUnique({ where: { id: legacyVariantMatch[1] } })
    : replacementVariantMatch
      ? replacement?.media
      : await db.media.findUnique({
          where: {
            storageKey: siblingVariantMatch
              ? `${siblingVariantMatch[1]}.png`
              : storageKey,
          },
        });
  if (!media || media.deletedAt) return new NextResponse(null, { status: 404 });

  const variantMatch = legacyVariantMatch ?? replacementVariantMatch;
  const variantFormat = variantMatch?.[2] ?? siblingVariantMatch?.[3];
  const isVariant = Boolean(variantFormat);
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
  if (
    media.kind === "review" ||
    media.kind === "receipt" ||
    media.kind === "invoice" ||
    media.kind === "expense"
  )
    return new NextResponse(null, { status: 404 });
  if (isPrivate) {
    // Backup contents require their own permission; media upload is unrelated.
    // Receipts always use their dedicated capability-protected endpoint above.
    const session = await auth();
    if (!session?.user?.id || !(await can(session.user.id, "backup.view")))
      // Don't reveal that the object exists.
      return new NextResponse(null, { status: 404 });
  }

  const bytes = await storage.getBytes(storageKey);
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": variantFormat ? `image/${variantFormat}` : media.mime,
      "content-length": String(bytes.length),
      ...(isPrivate
        ? {
            "content-disposition": "attachment",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            "content-security-policy": "sandbox",
          }
        : {}),
      "cache-control": isPrivate
        ? "private, no-store"
        : isVariant
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
    },
  });
}
