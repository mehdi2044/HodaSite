import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { persistOperationalAlerts, operationalAlerts } from "@/modules/health";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "persistent operational health alerts",
  () => {
    afterEach(async () => {
      await persistOperationalAlerts([]);
    });
    it("deduplicates concurrent ticks, resolves recovery and retains recurrence history", async () => {
      await persistOperationalAlerts([]);
      const alerts = operationalAlerts({
        lastBackupAt: null,
        offsiteOk: true,
        lowStock: 0,
        overdueUnpaid: 0,
        failedJobs: 0,
        staleMarkets: [],
      });
      const where = { code: "HEALTH_BACKUP_STALE", resolvedAt: null };
      await Promise.all([
        persistOperationalAlerts(alerts),
        persistOperationalAlerts(alerts),
      ]);
      expect(await db.systemAlert.count({ where })).toBe(1);
      const first = await db.systemAlert.findFirstOrThrow({ where });
      await persistOperationalAlerts([]);
      expect(
        (await db.systemAlert.findUniqueOrThrow({ where: { id: first.id } }))
          .resolvedAt,
      ).not.toBeNull();
      await persistOperationalAlerts(alerts);
      const second = await db.systemAlert.findFirstOrThrow({ where });
      expect(second.id).not.toBe(first.id);
    });
  },
);
