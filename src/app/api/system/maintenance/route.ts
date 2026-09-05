import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { setMaintenanceFlag, isMaintenanceOn } from "@/modules/settings";
import { inFlightCount } from "@/lib/request-metrics";

// The in-flight counter is per-instance (single-container assumption) — see
// src/lib/request-metrics.ts. `restore.sh` turns maintenance on, then polls
// this endpoint until it reads `inFlight: 0` before it touches the database.

function authorized(r: Request) {
  return (
    r.headers.get("x-maintenance-secret") === process.env.MAINTENANCE_SECRET
  );
}

export async function GET(r: Request) {
  if (!authorized(r))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    state: (await isMaintenanceOn()) ? "on" : "off",
    inFlight: inFlightCount(),
  });
}

export async function POST(r: Request) {
  if (!authorized(r))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await r.text();
  const on = new URLSearchParams(text).get("state") === "on";

  // Merge only `state` (PR #4 review, P2): a full replace here would
  // permanently wipe the admin-configured message/allowlist/schedule every
  // time restore.sh runs, since restore always drives maintenance through
  // this endpoint.
  const current = await db.siteSettings.findUnique({
    where: { id: "default" },
    select: { maintenance: true },
  });
  const currentMaintenance =
    (current?.maintenance as Record<string, unknown> | null) ?? {};
  await db.siteSettings.update({
    where: { id: "default" },
    data: { maintenance: { ...currentMaintenance, state: on ? "on" : "off" } },
  });
  // Synchronous — the write-gate reads this flag directly, no DB round-trip.
  setMaintenanceFlag(on);
  // The storefront full-page gate reads getMaintenanceConfig() (unstable_cache,
  // tag "site-settings"); without this, a cache warmed while maintenance was
  // off kept reporting effective:false while a restore was actually running
  // (D23, PR #4 review, P1).
  revalidateTag("site-settings");
  return NextResponse.json({
    state: on ? "on" : "off",
    inFlight: inFlightCount(),
  });
}
