import NextAuth, { type NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSeoPath, privateSeoPath } from "@/lib/seo-urls";
import createIntlMiddleware from "next-intl/middleware";
import { adminRedirectUrl } from "@/modules/auth/redirects";
import authConfig from "@/modules/auth/config";
import { routing } from "@/i18n/routing";
import { getClientIp } from "@/lib/net";
import faMessages from "../messages/fa.json";
import trMessages from "../messages/tr.json";
import enMessages from "../messages/en.json";

// Verifies the session JWT (signature + expiry) with AUTH_SECRET via
// authConfig — this is a real check, not a cookie-presence check.
const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MARKET_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_MARKET_BY_LOCALE: Record<string, string> = {
  fa: "IR",
  tr: "TR",
  en: "CA",
};
const MAINTENANCE_COPY: Record<string, { title: string; body: string }> = {
  fa: faMessages.maintenance,
  tr: trMessages.maintenance,
  en: enMessages.maintenance,
};

type MaintenanceState = {
  state: "on" | "off";
  effective: boolean;
  message?: Partial<Record<"fa" | "tr" | "en", string>>;
  bypass: boolean;
};
type MarketInfo = {
  code: string;
  isActive: boolean;
  defaultLocale: string;
  enabledLocales: string[];
};

// The middleware runs at the edge and cannot reach Prisma, so it reads
// maintenance/market state from small public route handlers. Only fires on
// write requests for the API write-gate (rare) and on every storefront
// request for the full-page gate — no caching here, no staleness on toggle.
async function fetchMaintenanceWriteGateOn(req: NextRequest): Promise<boolean> {
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

async function fetchMaintenanceState(
  req: NextRequest,
  ip: string | null,
): Promise<MaintenanceState | null> {
  try {
    const url = new URL("/api/system/maintenance/state", req.nextUrl.origin);
    if (ip) url.searchParams.set("ip", ip);
    const res = await fetch(url, {
      cache: "no-store",
      // Marks this as an internal call so the route computes a real `bypass`
      // answer for the ip we pass it — a public caller must never be able to
      // probe the allowlist this way, so it always gets bypass:false without
      // this header (Phase 01b B2).
      headers: { "x-internal-secret": process.env.MAINTENANCE_SECRET ?? "" },
    });
    if (!res.ok) return null;
    return (await res.json()) as MaintenanceState;
  } catch {
    return null;
  }
}

async function historicalRedirect(
  req: NextRequest,
  target: string,
  market: string,
) {
  if (!["GET", "HEAD"].includes(req.method)) return null;
  const match = /^\/(fa|tr|en)\/(p|c|pages)\/([^/]+)\/?$/.exec(target);
  if (!match) return null;
  try {
    const url = new URL("/api/seo/redirect", req.url);
    url.search = new URLSearchParams({
      locale: match[1],
      kind: match[2],
      slug: decodeURIComponent(match[3]),
      market,
    }).toString();
    const result = await fetch(url, { cache: "no-store" });
    if (!result.ok) return null;
    const value = await result.json();
    if (typeof value.path !== "string" || !parseSeoPath(value.path))
      return null;
    const destination = new URL(value.path, req.url);
    destination.search = new URL(req.url).search;
    destination.searchParams.delete("market");
    return NextResponse.redirect(destination, 301);
  } catch {
    return null;
  }
}

async function fetchMarkets(req: NextRequest): Promise<MarketInfo[]> {
  try {
    const res = await fetch(
      new URL("/api/system/markets", req.nextUrl.origin),
      {
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    return ((await res.json()).markets ?? []) as MarketInfo[];
  } catch {
    return [];
  }
}

function resolveMarket(
  markets: MarketInfo[],
  cookieCode: string | undefined,
  locale: string,
): MarketInfo | undefined {
  const fromCookie = markets.find((m) => m.code === cookieCode && m.isActive);
  if (fromCookie) return fromCookie;
  const wantCode = DEFAULT_MARKET_BY_LOCALE[locale];
  return (
    markets.find((m) => m.code === wantCode && m.isActive) ??
    markets.find((m) => m.isActive)
  );
}

function maintenanceResponse(
  req: NextRequest,
  locale: string,
  message: Partial<Record<"fa" | "tr" | "en", string>> | undefined,
): NextResponse {
  const copy = MAINTENANCE_COPY[locale] ?? MAINTENANCE_COPY.fa;
  const body = message?.[locale as "fa" | "tr" | "en"] || copy.body;
  const dir = locale === "fa" ? "rtl" : "ltr";
  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbf8f3;color:#1a1a1a;font-family:system-ui,sans-serif;padding:24px;text-align:center}h1{font-size:1.5rem;margin:0 0 12px}p{color:#6b6b6b;max-width:32rem}</style></head><body><div><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(body)}</p></div></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "120",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/system/maintenance") ||
    pathname.startsWith("/api/auth/")
  );
}

async function applicationMiddleware(req: NextAuthRequest) {
  const { pathname, search } = req.nextUrl;
  req.headers.delete("x-hoda-seo-market");
  // Crawling documents are global endpoints, outside locale negotiation.
  if (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/sitemaps/")
  )
    return NextResponse.next({ request: { headers: req.headers } });

  // Public, identity-free installation assets; exact namespace, no locale redirect.
  if (
    pathname === "/sw.js" ||
    pathname.startsWith("/pwa/") ||
    pathname.startsWith("/og/")
  )
    return NextResponse.next({ request: { headers: req.headers } });

  // --- Admin: JWT guard, no locale routing ---
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const isLogin = pathname === "/admin/login";
    if (!isLogin && !req.auth?.user?.id) {
      const url = adminRedirectUrl("/admin/login", req.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    // Do not redirect a login page based on an edge-only JWT: the DB may
    // have revoked it. The server validates the registry on protected routes.
    if (
      !isLogin &&
      req.auth?.enrollmentOnly &&
      pathname !== "/admin/security/setup"
    ) {
      return NextResponse.redirect(
        adminRedirectUrl("/admin/security/setup", req.url),
      );
    }
    return NextResponse.next({ request: { headers: req.headers } });
  }

  // --- API: maintenance write-gate, no locale routing ---
  if (pathname.startsWith("/api/")) {
    if (
      WRITE_METHODS.has(req.method) &&
      !isMaintenanceExempt(pathname) &&
      (await fetchMaintenanceWriteGateOn(req))
    ) {
      return NextResponse.json(
        { error: "maintenance" },
        { status: 503, headers: { "retry-after": "120" } },
      );
    }
    return NextResponse.next({ request: { headers: req.headers } });
  }

  // --- Everything else: storefront ---
  const canonical = parseSeoPath(pathname);
  if (/^\/(fa|tr|en)\/m(?:\/|$)/.test(pathname) && !canonical)
    return new NextResponse(null, { status: 404 });
  const seg = pathname.split("/")[1];
  const urlLocale = (routing.locales as readonly string[]).includes(seg)
    ? seg
    : undefined;

  // Full-page maintenance gate (Phase 01a). Only meaningful once we know a
  // locale (root "/" is handled by next-intl's own redirect first).
  if (urlLocale) {
    const ip = getClientIp(req.headers);
    const maintenance = await fetchMaintenanceState(req, ip);
    // `effective` already folds in the uncached flag (state === "on") on the
    // route side, but check both explicitly here too — a restore in
    // progress (D23) must never be shadowed by a stale cache read, so the
    // uncached flag always wins, checked independently at this layer as well.
    const maintenanceOn = maintenance?.state === "on" || maintenance?.effective;
    if (maintenanceOn && !maintenance?.bypass) {
      return maintenanceResponse(req, urlLocale, maintenance?.message);
    }
  }

  // Market resolution + enabledLocales gate (D10, architecture §3.1).
  if (urlLocale) {
    const markets = await fetchMarkets(req);
    if (canonical) {
      if (!markets.length) return new NextResponse(null, { status: 503 });
      const market = markets.find(
        (m) =>
          m.code === canonical.market &&
          m.isActive &&
          m.enabledLocales.includes(canonical.locale),
      );
      if (!market) return new NextResponse(null, { status: 404 });
      const historical = await historicalRedirect(
        req,
        canonical.target,
        market.code,
      );
      if (historical) return historical;
      // NextURL normalizes 127.0.0.1 to localhost even when URL normalization
      // is disabled. A rewrite to that other origin becomes a second request,
      // losing our trusted market header and rerunning cookie-based routing.
      const target = new URL(req.url);
      target.pathname = canonical.target;
      target.searchParams.delete("market");
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("X-NEXT-INTL-LOCALE", canonical.locale);
      requestHeaders.set("x-hoda-seo-market", market.code);
      const response = NextResponse.rewrite(target, {
        request: { headers: requestHeaders },
      });
      response.cookies.set("market", market.code, {
        path: "/",
        maxAge: MARKET_COOKIE_MAX_AGE,
      });
      return response;
    }
    if (markets.length) {
      const cookieCode = req.cookies.get("market")?.value;
      const queryCode = req.nextUrl.searchParams.get("market") ?? undefined;
      const explicit = markets.find(
        (m) =>
          m.code === queryCode &&
          m.isActive &&
          m.enabledLocales.includes(urlLocale),
      );
      if (
        explicit &&
        ["GET", "HEAD"].includes(req.method) &&
        /^\/(fa|tr|en)(?:\/(p|c|pages)\/[^/]+)?\/?$/.test(pathname)
      ) {
        const url = new URL(req.url);
        url.pathname = `/${urlLocale}/m/${encodeURIComponent(explicit.code)}${pathname.slice(urlLocale.length + 1).replace(/\/$/, "")}`;
        url.searchParams.delete("market");
        return NextResponse.redirect(url, 301);
      }
      const market = resolveMarket(markets, cookieCode || queryCode, urlLocale);
      if (market) {
        const historical = await historicalRedirect(req, pathname, market.code);
        if (historical) return historical;
      }
      if (market && !market.enabledLocales.includes(urlLocale)) {
        const url = new URL(req.url);
        url.pathname =
          pathname.replace(`/${urlLocale}`, `/${market.defaultLocale}`) ||
          `/${market.defaultLocale}`;
        const redirectRes = NextResponse.redirect(url);
        redirectRes.cookies.set("market", market.code, {
          path: "/",
          maxAge: MARKET_COOKIE_MAX_AGE,
        });
        return redirectRes;
      }
      const res = intlMiddleware(req);
      if (market && market.code !== cookieCode) {
        res.cookies.set("market", market.code, {
          path: "/",
          maxAge: MARKET_COOKIE_MAX_AGE,
        });
      }
      return res;
    }
  }

  return intlMiddleware(req);
}

export default auth(async (request) => {
  const response = await applicationMiddleware(request);
  if (
    response &&
    (privateSeoPath(request.nextUrl.pathname) ||
      request.nextUrl.searchParams.has("preview"))
  )
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});

export const config = {
  // Run on everything except Next internals, static assets and /media/*
  // (served by its own route handler with its own access checks — B10).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|media/|pwa/|og/|sw[.]js$).*)",
  ],
};
