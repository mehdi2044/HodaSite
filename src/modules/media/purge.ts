import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { isMaintenanceOn } from "@/modules/settings";
import { JobDeferredError, registerJobHandler } from "@/modules/jobs";
import {
  MEDIA_PURGE_JOB,
  PURGE_RETENTION_DAYS_DEFAULT,
  type MediaVariants,
} from "./constants";

/**
 * Deliberately NOT the cached `getMediaSettings()` accessor: that goes
 * through `unstable_cache`, which requires Next's incremental-cache context
 * and throws outside a real request/build (including in this handler's own
 * integration tests). A background sweep running once an hour has no need
 * for that cache anyway — read the current value straight from the DB.
 */
export async function getPurgeRetentionDays(): Promise<number> {
  const s = await db.siteSettings.findUnique({
    where: { id: "default" },
    select: { media: true },
  });
  const raw = (s?.media as { purgeRetentionDays?: number } | null) ?? {};
  return raw.purgeRetentionDays ?? PURGE_RETENTION_DAYS_DEFAULT;
}

// The sweep re-enqueues itself, so it never needs an external scheduler
// beyond the existing cron/tick — this is just how often it re-checks.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function purgeOne(media: {
  id: string;
  storageKey: string;
  variants: unknown;
}): Promise<void> {
  await storage.delete(media.storageKey).catch(() => {});
  const variants = (media.variants as MediaVariants | null) ?? {};
  for (const byWidth of Object.values(variants)) {
    for (const variant of Object.values(byWidth ?? {})) {
      if (variant) await storage.delete(variant.key).catch(() => {});
    }
  }
  await db.media.delete({ where: { id: media.id } });
}

/**
 * Physically removes files + variants for media soft-deleted longer than the
 * configured retention (default 30 days, Phase 01b §1). Never runs while
 * maintenance is on (restore safety, D23) — defers instead of skipping
 * silently, and always reschedules itself for the next sweep.
 */
export async function mediaPurgeHandler(): Promise<void> {
  if (await isMaintenanceOn()) {
    // Still reschedule the next sweep — a JobDeferredError alone would just
    // retry this same job soon, which is fine too, but an explicit
    // reschedule keeps the cadence predictable across long maintenance
    // windows.
    await enqueueNextSweep();
    throw new JobDeferredError("maintenance is on");
  }

  const purgeRetentionDays = await getPurgeRetentionDays();
  const cutoff = new Date(
    Date.now() - purgeRetentionDays * 24 * 60 * 60 * 1000,
  );

  const toPurge = await db.media.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, storageKey: true, variants: true },
  });
  for (const media of toPurge) await purgeOne(media);

  await enqueueNextSweep();
}

async function enqueueNextSweep(): Promise<void> {
  await db.job.create({
    data: {
      type: MEDIA_PURGE_JOB,
      runAt: new Date(Date.now() + SWEEP_INTERVAL_MS),
    },
  });
}

/** Called once at process startup (src/instrumentation.ts). */
export async function registerMediaPurgeHandler(): Promise<void> {
  registerJobHandler(MEDIA_PURGE_JOB, mediaPurgeHandler);
  const pending = await db.job.findFirst({
    where: { type: MEDIA_PURGE_JOB, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (!pending) await enqueueNextSweep();
}
