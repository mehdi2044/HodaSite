import sharp, { type Sharp } from "sharp";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { isMaintenanceOn } from "@/modules/settings";
import {
  JobDeferredError,
  MAX_JOB_ATTEMPTS,
  registerJobHandler,
  type JobContext,
} from "@/modules/jobs";
import {
  IMAGE_FORMATS,
  IMAGE_WIDTHS,
  MEDIA_OPTIMIZE_JOB,
  type MediaVariants,
} from "./constants";

const BLUR_WIDTH = 16;

function variantKey(mediaId: string, format: string, width: number): string {
  // System-generated, content-independent of the original filename (D40).
  return `media/variants/${mediaId}/${width}.${format}`;
}

async function dominantColorHex(image: Sharp): Promise<string> {
  const { data } = await image
    .clone()
    .resize(1, 1, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

async function blurDataUrl(image: Sharp): Promise<string> {
  const buf = await image
    .clone()
    .resize(BLUR_WIDTH)
    .webp({ quality: 20 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

/**
 * Runs on the DB-backed job queue (type `media-optimize`, D21). Strips EXIF
 * and auto-rotates (`.rotate()` orients from EXIF then sharp's default
 * output drops the metadata), generates webp+avif at every configured width
 * that does not exceed the original (never upscale — if the original is
 * narrower than the smallest configured width, one variant is generated at
 * the original width instead), a 16px blur placeholder, and the dominant
 * color. Re-running is safe: variant keys are derived from (mediaId, width,
 * format) so a retry overwrites the same objects rather than duplicating
 * them (acceptance criterion #2).
 */
export async function mediaOptimizeHandler(job: JobContext): Promise<void> {
  const { mediaId } = job.payload as { mediaId: string };

  // Defer rather than fail: a restore's write-gate is transient, and a
  // deferred attempt doesn't count against MAX_JOB_ATTEMPTS.
  if (await isMaintenanceOn()) {
    throw new JobDeferredError("maintenance is on");
  }

  const media = await db.media.findUniqueOrThrow({ where: { id: mediaId } });

  try {
    const original = await storage.getBytes(media.storageKey);
    if (!original) throw new Error("original file missing from storage");

    const base = sharp(original).rotate();
    const metadata = await base.metadata();
    const originalWidth = metadata.width ?? 0;
    if (originalWidth <= 0) throw new Error("could not read image dimensions");

    const widths = IMAGE_WIDTHS.filter((w) => w <= originalWidth);
    if (widths.length === 0)
      widths.push(originalWidth as (typeof IMAGE_WIDTHS)[number]);

    const variants: MediaVariants = {};
    for (const format of IMAGE_FORMATS) {
      const byWidth: NonNullable<MediaVariants[typeof format]> = {};
      for (const width of widths) {
        const resized = base.clone().resize({
          width,
          withoutEnlargement: true,
        });
        const buffer =
          format === "webp"
            ? await resized.webp({ quality: 80 }).toBuffer()
            : await resized.avif({ quality: 60 }).toBuffer();
        const key = variantKey(mediaId, format, width);
        const url = await storage.put(key, buffer, `image/${format}`);
        byWidth[`${width}` as `${(typeof IMAGE_WIDTHS)[number]}`] = {
          key,
          url,
          bytes: buffer.length,
        };
      }
      variants[format] = byWidth;
    }

    const [blur, dominantColor] = await Promise.all([
      blurDataUrl(base),
      dominantColorHex(base),
    ]);

    await db.media.update({
      where: { id: mediaId },
      data: {
        status: "READY",
        variants: variants as object,
        width: originalWidth,
        height: metadata.height ?? null,
        blurDataUrl: blur,
        dominantColor,
        processingError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    // runJobs() decides FAILED-vs-retry for the Job row using this same
    // MAX_JOB_ATTEMPTS constant; mirror it here so Media.status only flips to
    // FAILED (visible "retry" in the admin grid) once no attempt is left —
    // while retries are still pending the media stays PROCESSING.
    const isFinalAttempt = job.attempts + 1 >= MAX_JOB_ATTEMPTS;
    await db.media.update({
      where: { id: mediaId },
      data: {
        processingError: message,
        ...(isFinalAttempt ? { status: "FAILED" as const } : {}),
      },
    });
    throw err;
  }
}

/** Called once at process startup (src/instrumentation.ts). */
export function registerMediaJobHandlers(): void {
  registerJobHandler(MEDIA_OPTIMIZE_JOB, mediaOptimizeHandler);
}
