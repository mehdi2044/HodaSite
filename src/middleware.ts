import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import authConfig from "@/modules/auth/config";

// Verifies the session JWT (signature + expiry) with AUTH_SECRET via
// authConfig — this is a real check, not a cookie-presence check.
const { auth } = NextAuth(authConfig);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The middleware runs at the edge and cannot reach Prisma, so it reads the
// maintenance flag from the public state endpoint. Only fires on write
// requests (rare), so it is not cached here — no staleness on toggle. The
// authoritative gate is still the app layer (src/lib/mutation-gate.ts and the
// mutating route handlers); this is a cheap front-line block that also covers
// routes added in later phases.
async function maintenanceOn(req: NextRequest): Promise<boolean> {
  try {
    const res = await fetch(
      new URL("/api/system/maintenance/state", req.nextUrl.origin),
      { cache: "no-store" },
    );
    return res.ok && (await res.json()).state === "on";
  } catch {
    return false;
  }
}

function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/system/maintenance") ||
    pathname.startsWith("/api/auth/")
  );
}

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/admin/login";

  if (isAdmin && !isLogin && !req.auth) {
    const url = new URL("/admin/login", req.nextUrl);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (isLogin && req.auth) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  // A8: reject write requests with 503 while maintenance mode is on. /admin
  // and the maintenance endpoint itself stay reachable.
  if (
    WRITE_METHODS.has(req.method) &&
    !isAdmin &&
    !isMaintenanceExempt(pathname) &&
    (await maintenanceOn(req))
  ) {
    return NextResponse.json(
      { error: "maintenance" },
      { status: 503, headers: { "retry-after": "120" } },
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/:path*"],
};
