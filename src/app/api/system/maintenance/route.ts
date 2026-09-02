import { NextResponse } from "next/server";
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
  await db.siteSettings.update({
    where: { id: "default" },
    data: { maintenance: { state: on ? "on" : "off" } },
  });
  // Synchronous — the write-gate reads this flag directly, no DB round-trip.
  setMaintenanceFlag(on);
  return NextResponse.json({
    state: on ? "on" : "off",
    inFlight: inFlightCount(),
  });
}
