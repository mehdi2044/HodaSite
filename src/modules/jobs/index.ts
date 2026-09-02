import { db } from "@/lib/db";

type JobHandler = (payload: unknown) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  heartbeat: async () => {},
};

/** Register a job type handler (modules call this at startup). */
export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers[type] = handler;
}

const BATCH = 10;

/**
 * Claim up to BATCH pending jobs and run them.
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
      WHERE status = 'PENDING' AND "runAt" <= now()
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
      await db.job.update({
        where: { id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          lastError: err instanceof Error ? err.message : "unknown",
        },
      });
    }
    processed += 1;
  }
  return processed;
}
