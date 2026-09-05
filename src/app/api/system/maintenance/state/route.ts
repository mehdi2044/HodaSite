import { NextResponse } from "next/server";
import {
  isMaintenanceOn,
  getMaintenanceConfig,
  isMaintenanceEffective,
} from "@/modules/settings";
import { isIpAllowlisted } from "@/lib/cidr";

// Public, unauthenticated: whether the site is in maintenance mode. Used by:
// - the middleware WRITE-gate (which cannot reach Prisma at the edge), via
//   `state` — strictly the plain on/off flag (restore-safety, unchanged
//   shape/meaning from Phase 00);
// - the middleware STOREFRONT full-page gate (Phase 01a), via `effective`
//   (on OR an active `scheduled` window) + localized `message` + `bypass`
//   (whether the caller's IP, passed as ?ip=, is in the maintenance
//   allowlist). No secret here — none of this is sensitive.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const [onFlag, cfg] = await Promise.all([
    isMaintenanceOn(),
    getMaintenanceConfig(),
  ]);
  // The uncached in-process flag always wins over the (tag-revalidated, but
  // still a cache) config read: a restore that just flipped maintenance on
  // must never be shadowed by a config read that hasn't picked it up yet
  // (D23, PR #4 review, P1).
  const effective = onFlag || isMaintenanceEffective(cfg);
  const ip = new URL(req.url).searchParams.get("ip");
  const bypass = effective && isIpAllowlisted(ip, cfg.allowlistIps);
  return NextResponse.json({
    state: onFlag ? "on" : "off",
    effective,
    message: cfg.message ?? {},
    bypass,
  });
}
