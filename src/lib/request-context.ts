import { cookies } from "next/headers";
import { getMarkets } from "@/modules/settings";

export type Market = Awaited<ReturnType<typeof getMarkets>>[number];

const DEFAULT_MARKET_BY_LOCALE: Record<string, string> = {
  fa: "IR",
  tr: "TR",
  en: "CA",
};

/**
 * Server-side market resolution mirroring the middleware (architecture
 * §3.1): cookie `market` → default market of locale → first active market.
 * The middleware has already redirected away any locale the resolved
 * market doesn't enable, so this never needs to redirect — just read.
 */
export async function getRequestContext(locale: string): Promise<{
  market: Market;
  markets: Market[];
  locale: string;
}> {
  const markets = await getMarkets();
  const cookieStore = await cookies();
  const cookieCode = cookieStore.get("market")?.value;

  const market =
    markets.find((m) => m.code === cookieCode && m.isActive) ??
    markets.find(
      (m) => m.code === DEFAULT_MARKET_BY_LOCALE[locale] && m.isActive,
    ) ??
    markets.find((m) => m.isActive) ??
    markets[0];

  return { market, markets, locale };
}
