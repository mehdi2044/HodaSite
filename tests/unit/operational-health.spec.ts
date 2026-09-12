import { describe, expect, it } from "vitest";
import {
  offsiteHealthy,
  operationalAlerts,
  recentBackup,
  type HealthSnapshot,
} from "@/modules/health";
const now = new Date("2026-09-12T12:00:00Z");
describe("operational health freshness", () => {
  it("never treats an old OK flag, missing timestamp or future timestamp as a recent offsite backup", () => {
    expect(recentBackup(new Date("2026-09-11T00:00:00Z"), now)).toBe(true);
    expect(recentBackup(new Date("2026-09-10T23:59:59Z"), now)).toBe(false);
    expect(recentBackup(new Date("2026-09-13T00:00:00Z"), now)).toBe(false);
    for (const offsiteSyncedAt of [null, new Date("2020-01-01")])
      expect(
        offsiteHealthy({ offsiteStatus: "OK", offsiteSyncedAt }, now),
      ).toBe(false);
    expect(
      offsiteHealthy({ offsiteStatus: "FAILED", offsiteSyncedAt: now }, now),
    ).toBe(false);
    expect(
      offsiteHealthy({ offsiteStatus: "OK", offsiteSyncedAt: now }, now),
    ).toBe(true);
  });
  it("generates only actionable conditions and removes them after recovery", () => {
    const healthy: HealthSnapshot = {
      lastBackupAt: now,
      offsiteOk: true,
      lowStock: 0,
      overdueUnpaid: 0,
      failedJobs: 0,
      staleMarkets: [],
    };
    expect(operationalAlerts(healthy, now)).toEqual([]);
    const alerts = operationalAlerts(
      {
        lastBackupAt: null,
        offsiteOk: false,
        lowStock: 1,
        overdueUnpaid: 1,
        failedJobs: 1,
        staleMarkets: ["IR"],
      },
      now,
    );
    expect(alerts.map((a) => a.code)).toEqual([
      "HEALTH_BACKUP_STALE",
      "HEALTH_OFFSITE_STALE",
      "HEALTH_LOW_STOCK",
      "HEALTH_UNPAID_BACKLOG",
      "HEALTH_FAILED_JOBS",
      "HEALTH_FX_STALE_IR",
    ]);
    expect(alerts.filter((a) => a.severity === "CRITICAL")).toHaveLength(2);
  });
});
