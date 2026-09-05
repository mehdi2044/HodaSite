import { NextResponse } from "next/server";
import { getMarkets } from "@/modules/settings";

// Public, unauthenticated: the fields the middleware needs to resolve/gate
// market + locale at the edge (D10, architecture §3.1). No pricing/finance
// fields here — those stay behind the admin markets page.
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
