import { db } from "@/lib/db";
const handlers: Record<string, (payload: unknown) => Promise<void>> = {
  heartbeat: async () => {},
};
export async function runJobs() {
  const jobs = await db.job.findMany({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    take: 10,
  });
  for (const job of jobs) {
    await db.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", lockedAt: new Date() },
    });
    try {
      const handler = handlers[job.type];
      if (!handler) throw new Error("Unknown handler");
      await handler(job.payload);
      await db.job.update({ where: { id: job.id }, data: { status: "DONE" } });
    } catch (error) {
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message : "Unknown",
        },
      });
    }
  }
  return jobs.length;
}
