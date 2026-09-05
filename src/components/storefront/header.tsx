import Link from "next/link";
import { db } from "@/lib/db";
import type { Market } from "@/lib/request-context";
import { LocaleSwitcher } from "./locale-switcher";
import { MarketSwitcher } from "./market-switcher";

export async function Header({
  locale,
  market,
  markets,
  siteName,
  logoMediaId,
  headerStyle,
}: {
  locale: string;
  market: Market;
  markets: Market[];
  siteName: string;
  logoMediaId?: string | null;
  headerStyle: string;
}) {
  const logo = logoMediaId
    ? await db.media.findUnique({ where: { id: logoMediaId } })
    : null;

  return (
    <header
      data-header-style={headerStyle}
      className="shell flex flex-wrap items-center justify-between gap-3 py-4"
    >
      <Link
        href={`/${locale}`}
        className="flex items-center gap-2 text-lg font-semibold text-text"
      >
        {logo ? (
          // Theme-provided remote/local logo — no next/image loader configured yet.
          <img src={logo.url} alt={siteName} className="h-8 w-auto" />
        ) : (
          siteName
        )}
      </Link>
      <div className="flex items-center gap-4">
        <LocaleSwitcher
          current={locale}
          enabledLocales={market.enabledLocales}
        />
        <MarketSwitcher current={market.code} markets={markets} />
      </div>
    </header>
  );
}
