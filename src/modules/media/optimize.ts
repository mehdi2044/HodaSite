import { createRenditions } from "./renditions";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { isMaintenanceOn } from "@/modules/settings";
import {
  JobDeferredError,
  MAX_JOB_ATTEMPTS,
  registerJobHandler,
  type JobContext,
} from "@/modules/jobs";
import { MEDIA_OPTIMIZE_JOB } from "./constants";

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

    const rendered = await createRenditions(
      original,
      storage,
      (format, width) => `media/variants/${mediaId}/${width}.${format}`,
    );

    await db.media.update({
      where: { id: mediaId },
      data: {
        status: "READY",
        ...rendered,
        variants: rendered.variants as object,
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
