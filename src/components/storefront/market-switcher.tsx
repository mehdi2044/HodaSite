"use client";
import { switchedMarketPath } from "@/lib/seo-urls";

const YEAR = 60 * 60 * 24 * 365;

export function MarketSwitcher({
  current,
  markets,
  ariaLabel,
}: {
  current: string;
  markets: {
    code: string;
    name: string;
    isActive: boolean;
    enabledLocales: string[];
    defaultLocale: string;
  }[];
  ariaLabel: string;
}) {
  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    document.cookie = `market=${code}; path=/; max-age=${YEAR}`;
    const url = new URL(window.location.href);
    const market = markets.find((m) => m.code === code && m.isActive);
    const path = market && switchedMarketPath(url.pathname, market);
    if (path) {
      url.pathname = path;
      url.searchParams.delete("market");
      window.location.assign(url);
      return;
    }
    // A hard reload lets the middleware re-run the enabledLocales gate for
    // the newly selected market (it may not offer the current locale).
    window.location.reload();
  }

  return (
    <select
      aria-label={ariaLabel}
      defaultValue={current}
      onChange={onChange}
      className="min-h-11 rounded-full border border-black/10 bg-transparent px-3 text-sm"
    >
      {markets
        .filter((m) => m.isActive)
        .map((m) => (
          <option key={m.code} value={m.code}>
            {m.name}
          </option>
        ))}
    </select>
  );
}
