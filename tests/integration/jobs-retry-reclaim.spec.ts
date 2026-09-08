import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  runJobs,
  registerJobHandler,
  MAX_JOB_ATTEMPTS,
  JobDeferredError,
} from "@/modules/jobs";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const TEST_JOB_TYPES = [
  "test-always-fails",
  "test-succeeds",
  "test-deferred",
] as const;

describe.skipIf(!hasDb)(
  "job retry with backoff + stale-RUNNING reclaim",
  () => {
    beforeAll(() => {
      registerJobHandler("test-always-fails", async () => {
        throw new Error("boom");
      });
      registerJobHandler("test-succeeds", async () => {});
      registerJobHandler("test-deferred", async () => {
        throw new JobDeferredError("maintenance");
      });
    });

    afterEach(async () => {
      await db.job.deleteMany({
        where: {
          type: {
            in: [
              "test-always-fails",
              "test-succeeds",
              "test-deferred",
              "test-unrelated",
            ],
          },
        },
      });
    });

    it("an optional type filter leaves unrelated due jobs untouched", async () => {
      const selected = await db.job.create({
        data: { type: "test-succeeds", runAt: new Date(Date.now() - 1000) },
      });
      const unrelated = await db.job.create({
        data: {
          type: "test-unrelated",
          runAt: new Date(Date.now() - 2000),
        },
      });

      expect(await runJobs(["test-succeeds"])).toBe(1);
      await expect(
        db.job.findUniqueOrThrow({ where: { id: selected.id } }),
      ).resolves.toMatchObject({ status: "DONE" });
      await expect(
        db.job.findUniqueOrThrow({ where: { id: unrelated.id } }),
      ).resolves.toMatchObject({ status: "PENDING", attempts: 0 });
      await db.job.delete({ where: { id: unrelated.id } });
    });

    it("retries a failing job with a future runAt instead of failing it immediately", async () => {
      const job = await db.job.create({
        data: { type: "test-always-fails", runAt: new Date(Date.now() - 1000) },
      });

      await runJobs(TEST_JOB_TYPES);

      const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(after.status).toBe("PENDING");
      expect(after.attempts).toBe(1);
      expect(after.lastError).toBe("boom");
      expect(after.runAt.getTime()).toBeGreaterThan(Date.now());

      // Not due yet — a second run must not pick it up early.
      const processed = await runJobs(TEST_JOB_TYPES);
      const stillPending = await db.job.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(stillPending.attempts).toBe(1);
      expect(processed).toBe(0);
    });

    it("stops retrying and goes FAILED after MAX_JOB_ATTEMPTS (media never stuck retrying forever)", async () => {
      const job = await db.job.create({
        data: {
          type: "test-always-fails",
          runAt: new Date(Date.now() - 1000),
          attempts: MAX_JOB_ATTEMPTS - 1, // this run is the last allowed attempt
        },
      });

      await runJobs(TEST_JOB_TYPES);

      const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(after.status).toBe("FAILED");
      expect(after.attempts).toBe(MAX_JOB_ATTEMPTS);
    });

    it("reclaims a job abandoned in RUNNING by a worker that died mid-job", async () => {
      const job = await db.job.create({
        data: { type: "test-succeeds", runAt: new Date(Date.now() - 1000) },
      });
      // Simulate: a previous runJobs() claimed it (RUNNING) and then the
      // process was killed before finishing — lockedAt never advances again.
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "RUNNING",
          lockedAt: new Date(Date.now() - 6 * 60_000),
        },
      });

      const processed = await runJobs(TEST_JOB_TYPES);

      expect(processed).toBe(1);
      const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(after.status).toBe("DONE");
    });

    it("does not reclaim a RUNNING job that is still recent (a worker legitimately still working)", async () => {
      const job = await db.job.create({
        data: { type: "test-succeeds", runAt: new Date(Date.now() - 1000) },
      });
      await db.job.update({
        where: { id: job.id },
        data: { status: "RUNNING", lockedAt: new Date() },
      });

      const processed = await runJobs(TEST_JOB_TYPES);

      expect(processed).toBe(0);
      const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(after.status).toBe("RUNNING");
    });

    it("JobDeferredError (e.g. maintenance is on) reschedules without counting an attempt", async () => {
      const job = await db.job.create({
        data: { type: "test-deferred", runAt: new Date(Date.now() - 1000) },
      });

      const processed = await runJobs(TEST_JOB_TYPES);

      expect(processed).toBe(1);
      const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(after.status).toBe("PENDING");
      expect(after.attempts).toBe(0);
      expect(after.runAt.getTime()).toBeGreaterThan(Date.now());
    });
  },
);
