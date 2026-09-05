import { db } from "@/lib/db";

/**
 * A handler throws this to say "not now, try again shortly" — e.g. the
 * maintenance write-gate is on (Phase 01b §2). Unlike a real failure, this
 * never counts against MAX_JOB_ATTEMPTS: the job goes back to PENDING with
 * the same attempts count and a short fixed delay.
 */
export class JobDeferredError extends Error {}

type JobHandler = (payload: unknown) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  heartbeat: async () => {},
};

/** Register a job type handler (modules call this at startup). */
export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers[type] = handler;
}

const BATCH = 10;

// A worker that dies mid-job (killed process, OOM, deploy) leaves its claimed
// rows stuck in RUNNING forever, since nothing else ever reclaims them. Any
// row RUNNING longer than this is treated as abandoned and claimed again
// (Phase 01b acceptance criterion: "kill the worker mid-job, restart -> the
// job resumes"). Comfortably longer than any real job (image processing)
// should ever take.
const STALE_RUNNING_MINUTES = 5;

// Phase 01b: a failing job (e.g. media-optimize) gets retried with backoff
// instead of going straight to FAILED, up to this many total attempts —
// after that it stays FAILED for good (visible "retry" in the admin UI).
export const MAX_JOB_ATTEMPTS = 3;

function backoffSeconds(attempt: number): number {
  // attempt is 1-indexed (the attempt that just failed): 30s, 60s, 120s.
  return 30 * 2 ** (attempt - 1);
}

const DEFERRED_RETRY_SECONDS = 60;

/**
 * Claim up to BATCH due jobs (PENDING, or RUNNING but abandoned) and run them.
 *
 * Claiming happens in one transaction with `SELECT ... FOR UPDATE SKIP LOCKED`
 * (fix-order B8) so two concurrent runners never pick the same row: the second
 * transaction skips the rows the first locked, then each claimed row is flipped
 * to RUNNING before the transaction commits.
 */
export async function runJobs(): Promise<number> {
  const claimedIds = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Job"
      WHERE ("status" = 'PENDING' AND "runAt" <= now())
         OR ("status" = 'RUNNING' AND "lockedAt" <= now() - (${STALE_RUNNING_MINUTES}::text || ' minutes')::interval)
      ORDER BY "runAt"
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    `;
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await tx.job.updateMany({
        where: { id: { in: ids } },
        data: { status: "RUNNING", lockedAt: new Date() },
      });
    }
    return ids;
  });

  let processed = 0;
  for (const id of claimedIds) {
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    try {
      const handler = handlers[job.type];
      if (!handler) throw new Error(`Unknown job handler: ${job.type}`);
      await handler(job.payload);
      await db.job.update({ where: { id }, data: { status: "DONE" } });
    } catch (err) {
      if (err instanceof JobDeferredError) {
        await db.job.update({
          where: { id },
          data: {
            status: "PENDING",
            lastError: err.message,
            runAt: new Date(Date.now() + DEFERRED_RETRY_SECONDS * 1000),
          },
        });
        processed += 1;
        continue;
      }
      const attempts = job.attempts + 1;
      const lastError = err instanceof Error ? err.message : "unknown";
      if (attempts < MAX_JOB_ATTEMPTS) {
        await db.job.update({
          where: { id },
          data: {
            status: "PENDING",
            attempts,
            lastError,
            runAt: new Date(Date.now() + backoffSeconds(attempts) * 1000),
          },
        });
      } else {
        await db.job.update({
          where: { id },
          data: { status: "FAILED", attempts, lastError },
        });
      }
    }
    processed += 1;
  }
  return processed;
}
