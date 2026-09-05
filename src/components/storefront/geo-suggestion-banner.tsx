import { headers, cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { Market } from "@/lib/request-context";
import { GeoBannerClient } from "./geo-banner-client";

// Suggestion only, never a redirect (Phase 01a §1). Sources, in order: a
// configurable geo header name (GEO_COUNTRY_HEADER env), the common
// vendor/CDN headers, then Accept-Language as a last resort.
const GEO_HEADER_CANDIDATES = ["x-vercel-ip-country", "cf-ipcountry"];
const COUNTRY_TO_MARKET: Record<string, string> = {
  IR: "IR",
  TR: "TR",
  CA: "CA",
};
const MESSAGE_KEY_BY_MARKET: Record<
  string,
  "suggestFa" | "suggestTr" | "suggestCa"
> = {
  IR: "suggestFa",
  TR: "suggestTr",
  CA: "suggestCa",
};

function detectCountry(h: Headers): string | undefined {
  const customHeader = process.env.GEO_COUNTRY_HEADER;
  const names = customHeader
    ? [customHeader, ...GEO_HEADER_CANDIDATES]
    : GEO_HEADER_CANDIDATES;
  for (const name of names) {
    const v = h.get(name);
    if (v) return v.toUpperCase();
  }
  const acceptLanguage = h
    .get("accept-language")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (acceptLanguage?.startsWith("fa")) return "IR";
  if (acceptLanguage?.startsWith("tr")) return "TR";
  return undefined;
}

export async function GeoSuggestionBanner({
  currentMarketCode,
  markets,
}: {
  currentMarketCode: string;
  markets: Market[];
}) {
  const [h, c] = await Promise.all([headers(), cookies()]);
  if (c.get("geoBannerDismissed")?.value === "1") return null;

  const country = detectCountry(h);
  const suggestedCode = country && COUNTRY_TO_MARKET[country];
  if (!suggestedCode || suggestedCode === currentMarketCode) return null;

  const suggestedMarket = markets.find(
    (m) => m.code === suggestedCode && m.isActive,
  );
  if (!suggestedMarket) return null;

  const t = await getTranslations("geoBanner");
  return (
    <GeoBannerClient
      marketCode={suggestedCode}
      text={t(MESSAGE_KEY_BY_MARKET[suggestedCode])}
      switchLabel={t("switch")}
      dismissLabel={t("dismiss")}
    />
  );
}
