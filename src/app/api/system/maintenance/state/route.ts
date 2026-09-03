import { NextResponse } from "next/server";
import { isMaintenanceOn } from "@/modules/settings";

// Public, unauthenticated: whether the site is in maintenance mode. Used by
// the middleware write-gate (which cannot reach Prisma at the edge) and, in a
// later phase, by a storefront banner. No secret and no in-flight count here —
// that stays on the authenticated GET /api/system/maintenance.
export async function GET() {
  return NextResponse.json({ state: (await isMaintenanceOn()) ? "on" : "off" });
}
