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
import { z } from "zod";
import type { JobContext } from "@/modules/jobs";

export const MEDIA_PURGE_OBJECTS_JOB = "media-purge-objects";
const cleanupPayload = z.object({
  mediaId: z.string().min(1),
  keys: z
    .array(
      z
        .string()
        .regex(/^media\//)
        .refine(
          (key) =>
            !key.includes("\\") &&
            !key.includes("\0") &&
            key
              .split("/")
              .every((part) => part !== "" && part !== "." && part !== ".."),
        ),
    )
    .min(1),
});

/** The committed outbox survives crashes and partial storage deletion.
 * Both storage providers delete missing keys idempotently. The payload stays
 * in Job even if storage or the final DONE write fails.
 */
export async function mediaPurgeObjectsHandler(
  job: Pick<JobContext, "id" | "payload">,
  target: StorageProvider = storage,
): Promise<void> {
  if (await isMaintenanceOn()) throw new JobDeferredError("maintenance is on");
  const { mediaId, keys } = cleanupPayload.parse(job.payload);
  // A restored database must never lose live media to a stale cleanup request.
  if (
    await db.media.findUnique({ where: { id: mediaId }, select: { id: true } })
  )
    throw new Error("purge cleanup still has a Media row");
  for (const key of keys) await target.delete(key);
  await db.job.update({
    where: { id: job.id },
    data: { status: "DONE", lastError: null },
  });
}

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
  if (!media.storageKey.startsWith("media/"))
    throw new Error("Private/financial documents cannot be purged");
  if (await isMaintenanceOn()) throw new JobDeferredError("maintenance is on");
  const retention = await getPurgeRetentionDays();
  const jobId = `media-purge-objects:${media.id}`;
  const cleanup = await db.$transaction(async (tx) => {
    // FK reference creation takes KEY SHARE. This stronger lock waits for
    // existing writers; new writers wait and fail their FK if deletion commits.
    // JSON/scalar writers use lockMediaReferences for the same guarantee.
    await tx.$queryRaw`SELECT id FROM "Media" WHERE id = ${media.id} FOR UPDATE`;
    const current = await tx.media.findUnique({ where: { id: media.id } });
    if (!current) return tx.job.findUnique({ where: { id: jobId } });
    if (
      !current.deletedAt ||
      current.deletedAt.getTime() > Date.now() - retention * 86_400_000 ||
      !["image", "document"].includes(current.kind) ||
      !current.storageKey.startsWith("media/") ||
      current.status === "PROCESSING"
    )
      return null;
    const counts = await Promise.all([
      tx.productMedia.count({ where: { mediaId: current.id } }),
      tx.variantMedia.count({ where: { mediaId: current.id } }),
      tx.category.count({ where: { mediaId: current.id } }),
      tx.color.count({ where: { swatchMediaId: current.id } }),
      tx.receipt.count({ where: { mediaId: current.id } }),
      tx.invoice.count({ where: { mediaId: current.id } }),
      tx.reviewPhoto.count({ where: { mediaId: current.id } }),
      // A replacement can still own originals/renditions. Keep its evidence.
      tx.mediaReplacement.count({
        where: { mediaId: current.id, status: { not: "DONE" } },
      }),
      tx.job.count({
        where: {
          type: "media-optimize",
          status: { in: ["PENDING", "RUNNING"] },
          payload: { path: ["mediaId"], equals: current.id },
        },
      }),
    ]);
    if (counts.some(Boolean)) return null;
    const [references] = await tx.$queryRaw<{ used: boolean }[]>`
      SELECT (
        EXISTS (SELECT 1 FROM "ThemeSettings" WHERE ${current.id} IN
          ("logoMediaId", "logoDarkMediaId", "faviconMediaId", "emailLogoMediaId"))
        OR EXISTS (SELECT 1 FROM "Invoice"
          WHERE snapshot->>'logoMediaId' = ${current.id})
        OR EXISTS (SELECT 1 FROM "Page" WHERE jsonb_path_exists(
          blocks, '$.**.mediaId ? (@ == $id)', jsonb_build_object('id', ${current.id}::text)))
        OR EXISTS (SELECT 1 FROM "Integration" WHERE key='fitting-room' AND jsonb_path_exists(
          config, '$.**.mediaId ? (@ == $id)', jsonb_build_object('id', ${current.id}::text)))
        OR EXISTS (SELECT 1 FROM "Homepage" WHERE jsonb_path_exists(
          blocks, '$.**.mediaId ? (@ == $id)', jsonb_build_object('id', ${current.id}::text)))
      ) AS used
    `;
    // Include draft and soft-deleted content: restoration must remain possible.
    if (references.used) return null;
    const keys = [current.storageKey];
    for (const widths of Object.values(
      (current.variants as MediaVariants | null) ?? {},
    ))
      for (const rendition of Object.values(widths ?? {}))
        if (rendition) keys.push(rendition.key);
    const payload = cleanupPayload.parse({
      mediaId: current.id,
      keys: [...new Set(keys)],
    });
    // Commit deletion and durable cleanup intent together. A failed constraint,
    // DB write or commit rolls both back and no storage call has happened.
    await tx.media.delete({ where: { id: current.id } });
    return tx.job.create({
      data: { id: jobId, type: MEDIA_PURGE_OBJECTS_JOB, payload },
    });
  });
  if (cleanup && cleanup.status !== "DONE")
    await mediaPurgeObjectsHandler(cleanup, target);
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
      kind: { notIn: ["receipt", "backup", "invoice", "expense"] },
    },
    select: { id: true, storageKey: true, variants: true },
  });
  try {
    // Failed object cleanup is retained and retried by the existing queue.
    // Hourly sweeps re-arm exhausted retries after storage becomes available.
    await db.job.updateMany({
      where: { type: MEDIA_PURGE_OBJECTS_JOB, status: "FAILED" },
      data: { status: "PENDING", attempts: 0, runAt: new Date() },
    });
    for (const media of toPurge) await purgeOne(media);
  } finally {
    await enqueueNextSweep();
  }
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
  registerJobHandler(MEDIA_PURGE_OBJECTS_JOB, mediaPurgeObjectsHandler);
}

/** Reconcile on every real cron tick: recover even if a sweep exhausted its
 * retries during a DB outage before it could schedule its successor. */
export async function ensurePurgeSweepScheduled(): Promise<void> {
  await db.$transaction(async (tx) => {
    // Serialize check + insert across cron requests and application replicas.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('media-purge-sweep-reconcile'))`;
    const pending = await tx.job.findFirst({
      where: { type: MEDIA_PURGE_JOB, status: { in: ["PENDING", "RUNNING"] } },
    });
    if (!pending)
      await tx.job.create({
        data: {
          type: MEDIA_PURGE_JOB,
          runAt: new Date(Date.now() + SWEEP_INTERVAL_MS),
        },
      });
  });
}
