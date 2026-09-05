import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
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
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MaintenanceState;
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
      (await fetchMaintenanceWriteGateOn(req))
    ) {
      return NextResponse.json(
        { error: "maintenance" },
        { status: 503, headers: { "retry-after": "120" } },
      );
    }
    return NextResponse.next();
  }

  // --- Everything else: storefront ---
  const seg = pathname.split("/")[1];
  const urlLocale = (routing.locales as readonly string[]).includes(seg)
    ? seg
    : undefined;

  // Full-page maintenance gate (Phase 01a). Only meaningful once we know a
  // locale (root "/" is handled by next-intl's own redirect first).
  if (urlLocale) {
    const ip = getClientIp(req.headers);
    const maintenance = await fetchMaintenanceState(req, ip);
    if (maintenance?.effective && !maintenance.bypass) {
      return maintenanceResponse(req, urlLocale, maintenance.message);
    }
  }

  // Market resolution + enabledLocales gate (D10, architecture §3.1).
  if (urlLocale) {
    const markets = await fetchMarkets(req);
    if (markets.length) {
      const cookieCode = req.cookies.get("market")?.value;
      const market = resolveMarket(markets, cookieCode, urlLocale);
      if (market && !market.enabledLocales.includes(urlLocale)) {
        const url = req.nextUrl.clone();
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
});

export const config = {
  // Run on everything except Next internals, static assets and /media/*
  // (served by its own route handler with its own access checks — B10).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|media/).*)"],
};
