import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import authConfig from "@/modules/auth/config";
import { routing } from "@/i18n/routing";

// Verifies the session JWT (signature + expiry) with AUTH_SECRET via
// authConfig — this is a real check, not a cookie-presence check.
const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The middleware runs at the edge and cannot reach Prisma, so it reads the
// maintenance flag from the public state endpoint. Only fires on write
// requests (rare), so it is not cached here — no staleness on toggle. The
// authoritative gate is still the app layer (src/lib/mutation-gate.ts and the
// mutating route handlers); this is a cheap front-line block.
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

  // --- Admin: JWT guard, no locale routing ---
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const isLogin = pathname === "/admin/login";
    if (!isLogin && !req.auth) {
      const url = new URL("/admin/login", req.nextUrl);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    if (isLogin && req.auth) {
      return NextResponse.redirect(new URL("/admin", req.nextUrl));
    }
    return NextResponse.next();
  }

  // --- API: maintenance write-gate, no locale routing ---
  if (pathname.startsWith("/api/")) {
    if (
      WRITE_METHODS.has(req.method) &&
      !isMaintenanceExempt(pathname) &&
      (await maintenanceOn(req))
    ) {
      return NextResponse.json(
        { error: "maintenance" },
        { status: 503, headers: { "retry-after": "120" } },
      );
    }
    return NextResponse.next();
  }

  // --- Everything else: storefront locale routing (next-intl) ---
  return intlMiddleware(req);
});

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
