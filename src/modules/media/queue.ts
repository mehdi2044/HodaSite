import { db } from "@/lib/db";
import { MEDIA_OPTIMIZE_JOB } from "./constants";

/**
 * Swappable driver for "go process this media asynchronously" (Phase 01b
 * §2, D21). The default (only) implementation is the existing DB-backed
 * `Job` table — no Redis/BullMQ. Call sites depend only on this interface so
 * a future driver never touches them.
 */
export interface ImageProcessingQueue {
  enqueue(mediaId: string): Promise<void>;
  /** Re-run a FAILED media from the admin "retry" button — resets attempts. */
  enqueueRetry(mediaId: string): Promise<void>;
}

class DbImageProcessingQueue implements ImageProcessingQueue {
  async enqueue(mediaId: string): Promise<void> {
    await db.job.create({
      data: { type: MEDIA_OPTIMIZE_JOB, payload: { mediaId } },
    });
  }

  async enqueueRetry(mediaId: string): Promise<void> {
    await db.$transaction([
      db.media.update({
        where: { id: mediaId },
        data: { status: "PROCESSING", processingError: null },
      }),
      db.job.create({
        data: { type: MEDIA_OPTIMIZE_JOB, payload: { mediaId } },
      }),
    ]);
  }
}

export const imageProcessingQueue: ImageProcessingQueue =
  new DbImageProcessingQueue();
