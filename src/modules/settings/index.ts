import { db } from "@/lib/db";

export async function getAppearance() {
  try {
    return await Promise.all([
      db.siteSettings.findUnique({ where: { id: "default" } }),
      db.themeSettings.findUnique({ where: { id: "default" } }),
    ]);
  } catch {
    return [null, null] as const;
  }
}

// Maintenance flag (fix-order A8).
//
// The write-gate must never act on a stale value (Vee): a mutation arriving
// seconds after maintenance was switched on must still be rejected. So the
// source of truth is an in-process flag that POST /api/system/maintenance sets
// synchronously (same process — single-container assumption, D22). The DB is
// read only to hydrate the flag on a cold start (covers the app restarting
// while maintenance was left on). There is no TTL cache on this path.
let maintenanceFlag: boolean | undefined;

/** Called synchronously by the maintenance toggle endpoint. */
export function setMaintenanceFlag(on: boolean): void {
  maintenanceFlag = on;
}

export async function isMaintenanceOn(): Promise<boolean> {
  if (maintenanceFlag !== undefined) return maintenanceFlag;
  try {
    const s = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { maintenance: true },
    });
    maintenanceFlag =
      (s?.maintenance as { state?: string } | null)?.state === "on";
    return maintenanceFlag;
  } catch {
    // Cold start + DB unreachable. Restore always sets maintenance through the
    // endpoint (which sets the flag directly), so an unreadable DB here means
    // "not in a restore". Leave the flag unset so the next call retries.
    return false;
  }
}
