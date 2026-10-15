import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { fittingDiagnostics } from "@/modules/fitting/health";
const id = `r7b-${randomUUID()}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R7b read-only PostgreSQL diagnosis",
  () => {
    let owner = "",
      scoped = "",
      customer = "";
    const now = new Date();
    beforeAll(async () => {
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      const role = await db.role.findUniqueOrThrow({ where: { key: "owner" } });
      scoped = (
        await db.user.create({
          data: {
            email: `${id}@example.com`,
            name: "Synthetic scoped health actor",
            passwordHash: "fixture",
            roles: {
              create: {
                roleId: role.id,
                scope: { marketId: "seed-market-CA" },
              },
            },
          },
        })
      ).id;
      customer = (
        await db.customer.create({
          data: { email: `${id}@example.com`, locale: "en" },
        })
      ).id;
    });
    afterAll(async () => {
      // Charged-session snapshots are immutable. Retain synthetic history in this
      // owned *_test database; never disable the deletion guard for cleanup.
      await db.job.deleteMany({ where: { id: { startsWith: id } } });
      if (customer)
        await db.customer.update({
          where: { id: customer },
          data: { isActive: false },
        });
      if (scoped) {
        await db.userRole.deleteMany({ where: { userId: scoped } });
        await db.user.delete({ where: { id: scoped } });
      }
      vi.unstubAllGlobals();
    });
    it("rejects missing/scoped actors before reading diagnostics", async () => {
      await expect(fittingDiagnostics("missing-actor", now)).rejects.toThrow();
      await expect(fittingDiagnostics(scoped, now)).rejects.toThrow();
    });
    it("separates uncertain and failed states, measures delay, and never returns private data or mutates/dispatches", async () => {
      const network = vi.fn(() => {
        throw Error("No network permitted");
      });
      vi.stubGlobal("fetch", network);
      const before = await fittingDiagnostics(owner, now);
      const market = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      for (const [suffix, status, age, errorCode] of [
        ["queued-old", "QUEUED", 300_000, null],
        ["queued-new", "QUEUED", 299_999, null],
        ["running-old", "RUNNING", 300_000, null],
        ["running-new", "RUNNING", 299_999, null],
        ["review", "REVIEW", 1000, "PROVIDER_UNKNOWN"],
        ["failed", "FAILED", 1000, `${id}-PRIVATE_ERROR_TOKEN`],
      ] as const) {
        const at = new Date(now.getTime() - age);
        await db.fittingSession.create({
          data: {
            id: `${id}-${suffix}`,
            customerId: customer,
            marketId: market.id,
            requestKey: suffix,
            fingerprint: `${id}-PRIVATE_FINGERPRINT`,
            status,
            modelId: `${id}-PRIVATE_MODEL`,
            snapshot: { private: `${id}-PRIVATE_SNAPSHOT` },
            allocations: [],
            costCoins: "1",
            storageKey: `${id}-PRIVATE_STORAGE`,
            errorCode,
            createdAt: at,
            updatedAt: at,
            startedAt: status === "RUNNING" ? at : null,
          },
        });
      }
      await db.job.create({
        data: {
          id: `${id}-job`,
          type: "fitting-render",
          payload: { sessionId: `${id}-PRIVATE_SESSION` },
          status: "FAILED",
          lastError: `${id}-PRIVATE_ERROR`,
          attempts: 3,
        },
      });
      const digest = async () =>
        JSON.stringify(
          await Promise.all([
            db.fittingSession.findMany({
              where: { customerId: customer },
              orderBy: { id: "asc" },
            }),
            db.job.findMany({ where: { id: `${id}-job` } }),
            db.fittingCoinEntry.aggregate({
              _count: { _all: true },
              _sum: { amount: true },
            }),
          ]),
        );
      const unchanged = await digest();
      const value = await fittingDiagnostics(owner, now);
      expect(value.delayedQueued - before.delayedQueued).toBe(1);
      expect(value.delayedRunning - before.delayedRunning).toBe(1);
      expect(value.sessions24h.REVIEW - before.sessions24h.REVIEW).toBe(1);
      expect(value.sessions24h.FAILED - before.sessions24h.FAILED).toBe(1);
      expect(value.refunds24h).toBe(before.refunds24h);
      expect(
        value.errors24h.PROVIDER_UNKNOWN -
          (before.errors24h.PROVIDER_UNKNOWN ?? 0),
      ).toBe(1);
      expect(value.errors24h.OTHER - (before.errors24h.OTHER ?? 0)).toBe(1);
      expect(value.schedulerHeartbeat).toBe("UNVERIFIED");
      expect(value.providerConnection).toBe("UNVERIFIED");
      expect(value.storageConnection).toBe("UNVERIFIED");
      expect(JSON.stringify(value)).not.toContain(id);
      expect(JSON.stringify(value)).not.toContain("PRIVATE");
      expect(value.sessions24h).not.toHaveProperty("REFUNDED");
      expect(await digest()).toBe(unchanged);
      expect(network).not.toHaveBeenCalled();
    });
  },
);
