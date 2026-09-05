import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/**
 * Cached accessors (Phase 01a §2): the storefront reads settings through
 * these, never Prisma directly from components. Tagged `site-settings` /
 * `theme` / `markets`; every settings save calls `revalidateTag(...)` so a
 * change is visible on the very next request (no ISR delay).
 */
export const getSiteSettings = unstable_cache(
  async () => db.siteSettings.findUnique({ where: { id: "default" } }),
  ["site-settings"],
  { tags: ["site-settings"] },
);

export const getThemeSettings = unstable_cache(
  async () => db.themeSettings.findUnique({ where: { id: "default" } }),
  ["theme-settings"],
  { tags: ["theme"] },
);

export const getMarkets = unstable_cache(
  async () => db.market.findMany({ orderBy: { code: "asc" } }),
  ["markets"],
  { tags: ["markets"] },
);

export const getMarketByCode = unstable_cache(
  async (code: string) => db.market.findUnique({ where: { code } }),
  ["market-by-code"],
  { tags: ["markets"] },
);

/** @deprecated use getSiteSettings() / getThemeSettings() */
export async function getAppearance() {
  try {
    return await Promise.all([getSiteSettings(), getThemeSettings()]);
  } catch (err) {
    // The storefront still renders with fallback branding, but the failure
    // must be visible in the logs (B7).
    console.error("[settings] getAppearance failed:", err);
    return [null, null] as const;
  }
}

export type MaintenanceConfig = {
  state: "off" | "on" | "scheduled";
  message?: Partial<Record<"fa" | "tr" | "en", string>>;
  allowlistIps?: string[];
  startsAt?: string;
  endsAt?: string;
};

/** Is a `scheduled` maintenance window (or plain `on`) active right now? */
export function isMaintenanceEffective(
  cfg: MaintenanceConfig,
  now: Date = new Date(),
): boolean {
  if (cfg.state === "on") return true;
  if (cfg.state !== "scheduled") return false;
  if (cfg.startsAt && now < new Date(cfg.startsAt)) return false;
  if (cfg.endsAt && now > new Date(cfg.endsAt)) return false;
  return true;
}

/**
 * Full maintenance config for the storefront-facing page (message copy,
 * allowlist, schedule). Cached/tagged like the rest of `site-settings` —
 * distinct from the plain on/off flag below, which is the one thing the
 * restore-safety write-gate depends on and must stay simple.
 */
export const getMaintenanceConfig = unstable_cache(
  async (): Promise<MaintenanceConfig> => {
    const s = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { maintenance: true },
    });
    return (s?.maintenance as MaintenanceConfig | null) ?? { state: "off" };
  },
  ["maintenance-config"],
  { tags: ["site-settings"] },
);

// Maintenance flag (fix-order A8).
//
// The write-gate must never act on a stale value (Vee): a mutation arriving
// seconds after maintenance was switched on must still be rejected. So the
// source of truth is an in-process flag that POST /api/system/maintenance sets
// synchronously (same process — single-container assumption, D22). The DB is
// read only to hydrate the flag on a cold start (covers the app restarting
// while maintenance was left on). There is no TTL cache on this path.
//
// Deliberately independent of MaintenanceConfig/isMaintenanceEffective above:
// this flag means literally state === "on" (what restore.sh sets), never the
// "scheduled" storefront-page window, so the write-gate stays simple and
// TOCTOU-safe.
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
