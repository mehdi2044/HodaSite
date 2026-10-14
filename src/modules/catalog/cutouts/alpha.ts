import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { imageFingerprint } from "./models";
/** Decode existing stored raster only; no background-removal service or paid call. */
export async function inspectCutoutImage(mediaId: string) {
  const media = await db.media.findFirst({
    where: { id: mediaId, kind: "image", status: "READY", deletedAt: null },
  });
  if (
    !media ||
    !["image/png", "image/webp", "image/avif"].includes(media.mime) ||
    !media.storageKey.startsWith("media/")
  )
    throw new z.ZodError([]);
  try {
    const bytes = await storage.getBytes(media.storageKey);
    if (!bytes || bytes.length > 20 * 1024 * 1024) throw new z.ZodError([]);
    const image = sharp(bytes, { limitInputPixels: 25_000_000 });
    const metadata = await image.metadata();
    if (!metadata.hasAlpha || (metadata.pages && metadata.pages > 1))
      throw new z.ZodError([]);
    const stats = await image.stats();
    const alpha = stats.channels.at(-1);
    if (!alpha || alpha.min === 255 || alpha.max === 0)
      throw new z.ZodError([]);
    if (metadata.width !== media.width || metadata.height !== media.height)
      throw new z.ZodError([]);
    return {
      imageFingerprint: imageFingerprint(media),
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch {
    throw new z.ZodError([]);
  }
}
