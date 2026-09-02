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

// Maintenance flag (fix-order A8). Cached briefly so the write-gate does not
// hit the database on every mutation. On a read error we keep serving the last
// known value rather than flapping.
type MaintenanceCache = { value: boolean; at: number } | null;
let maintenanceCache: MaintenanceCache = null;
const MAINTENANCE_TTL_MS = 5_000;

export function bustMaintenanceCache(next?: boolean): void {
  maintenanceCache =
    next === undefined ? null : { value: next, at: Date.now() };
}

export async function isMaintenanceOn(): Promise<boolean> {
  if (maintenanceCache && Date.now() - maintenanceCache.at < MAINTENANCE_TTL_MS)
    return maintenanceCache.value;
  try {
    const s = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { maintenance: true },
    });
    const value = (s?.maintenance as { state?: string } | null)?.state === "on";
    maintenanceCache = { value, at: Date.now() };
    return value;
  } catch {
    return maintenanceCache?.value ?? false;
  }
}
