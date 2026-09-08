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
//   allowlist).
//
// `bypass` is the one sensitive bit: answering it for an arbitrary ?ip= would
// let anyone probe which IPs are on the allowlist. It's only computed for the
// middleware's own internal call (marked by x-internal-secret, Phase 01b
// B2) — every public caller gets bypass:false regardless of ?ip=.
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
  const isInternal =
    req.headers.get("x-internal-secret") === process.env.MAINTENANCE_SECRET;
  const ip = new URL(req.url).searchParams.get("ip");
  const bypass =
    isInternal && effective && isIpAllowlisted(ip, cfg.allowlistIps);
  return NextResponse.json({
    state: onFlag ? "on" : "off",
    effective,
    message: cfg.message ?? {},
    bypass,
  });
}
