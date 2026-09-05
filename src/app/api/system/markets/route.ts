import { NextResponse } from "next/server";
import { getMarkets } from "@/modules/settings";

// Public, unauthenticated: the fields the middleware needs to resolve/gate
// market + locale at the edge (D10, architecture §3.1). No pricing/finance
// fields here — those stay behind the admin markets page.
//
// This handler takes no request parameters, so without an explicit opt-out
// Next.js's automatic static optimization treats it as static and caches its
// result at build time — served forever after, never re-querying the DB and
// never reflecting a live admin edit. Force it dynamic.
export const dynamic = "force-dynamic";

export async function GET() {
  const markets = await getMarkets();
  return NextResponse.json({
    markets: markets.map((m) => ({
      code: m.code,
      isActive: m.isActive,
      defaultLocale: m.defaultLocale,
      enabledLocales: m.enabledLocales,
    })),
  });
}
