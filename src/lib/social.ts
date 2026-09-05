export const SOCIAL_KEYS = [
  "instagram",
  "telegram",
  "whatsapp",
  "x",
  "tiktok",
  "youtube",
  "linkedin",
] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export const MARKET_CODES = ["IR", "TR", "CA"] as const;
export type MarketCode = (typeof MARKET_CODES)[number];

export type SocialByMarket = Record<
  MarketCode,
  Partial<Record<SocialKey, string>>
>;

function emptyMarketSocial(): Partial<Record<SocialKey, string>> {
  return {};
}

/**
 * Normalizes SiteSettings.social — accepts either the current per-market
 * shape ({IR:{...},TR:{...},CA:{...}}) or a flat {instagram,...} shape (what
 * Phase 01a originally shipped before this review, and what a partially
 * upgraded database might still have), so a row that hasn't been resaved
 * through the new per-market form still renders correctly instead of
 * silently dropping every link (PR #4 review, P2).
 */
export function normalizeSocial(raw: unknown): SocialByMarket {
  const r = (raw ?? {}) as Record<string, unknown>;
  const looksPerMarket = MARKET_CODES.some(
    (m) => r[m] && typeof r[m] === "object" && !Array.isArray(r[m]),
  );

  if (looksPerMarket) {
    const out = {} as SocialByMarket;
    for (const market of MARKET_CODES) {
      out[market] =
        (r[market] as Partial<Record<SocialKey, string>>) ??
        emptyMarketSocial();
    }
    return out;
  }

  // Legacy flat shape: the same links applied to every market (matches
  // pre-review behavior, so nothing an admin already configured disappears).
  const flat: Partial<Record<SocialKey, string>> = {};
  for (const key of SOCIAL_KEYS) {
    if (typeof r[key] === "string") flat[key] = r[key] as string;
  }
  return { IR: { ...flat }, TR: { ...flat }, CA: { ...flat } };
}
