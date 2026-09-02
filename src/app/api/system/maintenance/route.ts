import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bustMaintenanceCache } from "@/modules/settings";
import { inFlightCount } from "@/lib/request-metrics";

// The in-flight counter is per-instance (single-container assumption) — see
// src/lib/request-metrics.ts. `restore.sh` polls this endpoint and waits for
// `inFlight: 0` before it touches the database.

function authorized(r: Request) {
  return (
    r.headers.get("x-maintenance-secret") === process.env.MAINTENANCE_SECRET
  );
}

export async function GET(r: Request) {
  if (!authorized(r))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await db.siteSettings.findUnique({ where: { id: "default" } });
  const m = s?.maintenance as { state?: string } | null;
  return NextResponse.json({
    state: m?.state ?? "off",
    inFlight: inFlightCount(),
  });
}

export async function POST(r: Request) {
  if (!authorized(r))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await r.text();
  const state = new URLSearchParams(text).get("state") === "on" ? "on" : "off";
  await db.siteSettings.update({
    where: { id: "default" },
    data: { maintenance: { state } },
  });
  bustMaintenanceCache(state === "on");
  return NextResponse.json({ state, inFlight: inFlightCount() });
}
