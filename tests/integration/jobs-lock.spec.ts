import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/lib/db";
import { runJobs, registerJobHandler } from "@/modules/jobs";

// FOR UPDATE SKIP LOCKED is real Postgres behaviour — this needs a database.
// Global setup (tests/setup/global-setup.ts) already confirmed
// TEST_DATABASE_URL is reachable when set, or fails the whole run — so
// presence alone is enough here.
const hasDb = Boolean(process.env.TEST_DATABASE_URL);

let runCount = 0;

describe.skipIf(!hasDb)("job claiming lock (B8)", () => {
  beforeAll(() => {
    registerJobHandler("test-slow", async () => {
      runCount += 1;
      await new Promise((r) => setTimeout(r, 200));
    });
  });

  afterEach(async () => {
    await db.job.deleteMany({ where: { type: "test-slow" } });
    runCount = 0;
  });

  it("runs a single pending job exactly once under two concurrent runners", async () => {
    const job = await db.job.create({
      data: { type: "test-slow", runAt: new Date(Date.now() - 1000) },
    });

    const [a, b] = await Promise.all([runJobs(), runJobs()]);

    expect(runCount).toBe(1);
    expect(a + b).toBe(1); // exactly one runner processed exactly one job

    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("DONE");
    expect(after.attempts).toBe(0);
  });

  it("splits a batch of pending jobs across concurrent runners with no overlap", async () => {
    await db.job.createMany({
      data: Array.from({ length: 6 }, () => ({
        type: "test-slow",
        runAt: new Date(Date.now() - 1000),
      })),
    });

    const results = await Promise.all([runJobs(), runJobs(), runJobs()]);

    expect(runCount).toBe(6);
    expect(results.reduce((s, n) => s + n, 0)).toBe(6);

    const done = await db.job.count({
      where: { type: "test-slow", status: "DONE" },
    });
    expect(done).toBe(6);
  });
});
