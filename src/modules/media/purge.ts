import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { isMaintenanceOn } from "@/modules/settings";
import { JobDeferredError, registerJobHandler } from "@/modules/jobs";
import {
  MEDIA_PURGE_JOB,
  PURGE_RETENTION_DAYS_DEFAULT,
  type MediaVariants,
} from "./constants";
import type { StorageProvider } from "@/modules/integrations/storage";

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

export async function purgeOne(
  media: {
    id: string;
    storageKey: string;
    variants: unknown;
  },
  target: StorageProvider = storage,
): Promise<void> {
  if (
    media.storageKey.startsWith("receipts/") ||
    media.storageKey.startsWith("invoices/")
  )
    throw new Error("Financial documents cannot be purged");
  await target.delete(media.storageKey);
  const variants = (media.variants as MediaVariants | null) ?? {};
  for (const byWidth of Object.values(variants)) {
    for (const variant of Object.values(byWidth ?? {})) {
      if (variant) await target.delete(variant.key);
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
    where: {
      deletedAt: { lte: cutoff },
      kind: { notIn: ["receipt", "backup", "invoice"] },
    },
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

/**
 * Synchronous, no I/O — safe to call at module load (src/app/api/cron/tick/
 * route.ts). Deliberately split from ensurePurgeSweepScheduled() below:
 * Next's `next build` actually imports/executes route modules while
 * "Collecting page data", so anything that touches the database can only run
 * lazily on a real request, never as a module-level side effect (this cost a
 * build failure — "Environment variable not found: DATABASE_URL" — to find).
 */
export function registerMediaPurgeHandler(): void {
  registerJobHandler(MEDIA_PURGE_JOB, mediaPurgeHandler);
}

let purgeSweepBootstrapped = false;

/** Called once, lazily, on the first real cron tick request. */
export async function ensurePurgeSweepScheduled(): Promise<void> {
  if (purgeSweepBootstrapped) return;
  purgeSweepBootstrapped = true;
  const pending = await db.job.findFirst({
    where: { type: MEDIA_PURGE_JOB, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (!pending) await enqueueNextSweep();
}
