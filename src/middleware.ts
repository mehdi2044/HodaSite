import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/modules/auth/config";

// Verifies the session JWT (signature + expiry) with AUTH_SECRET via
// authConfig — this is a real check, not a cookie-presence check.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/admin/login";

  if (isAdmin && !isLogin && !req.auth) {
    const url = new URL("/admin/login", req.nextUrl);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // Already signed in and visiting the login page → send to the dashboard.
  if (isLogin && req.auth) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
