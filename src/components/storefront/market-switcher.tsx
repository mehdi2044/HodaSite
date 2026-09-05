"use client";

const NAMES: Record<string, string> = {
  IR: "ایران",
  TR: "ترکیه",
  CA: "کانادا",
};
const YEAR = 60 * 60 * 24 * 365;

export function MarketSwitcher({
  current,
  markets,
}: {
  current: string;
  markets: { code: string; isActive: boolean }[];
}) {
  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    document.cookie = `market=${code}; path=/; max-age=${YEAR}`;
    // A hard reload lets the middleware re-run the enabledLocales gate for
    // the newly selected market (it may not offer the current locale).
    window.location.reload();
  }

  return (
    <select
      aria-label="بازار"
      defaultValue={current}
      onChange={onChange}
      className="min-h-9 rounded-[8px] border border-black/10 bg-transparent px-2 text-sm"
    >
      {markets
        .filter((m) => m.isActive)
        .map((m) => (
          <option key={m.code} value={m.code}>
            {NAMES[m.code] ?? m.code}
          </option>
        ))}
    </select>
  );
}
