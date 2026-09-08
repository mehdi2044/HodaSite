import Link from "next/link";
import { db } from "@/lib/db";
import type { Market } from "@/lib/request-context";
import { LocaleSwitcher } from "./locale-switcher";
import { MarketSwitcher } from "./market-switcher";
import { ResponsiveImage } from "./responsive-image";

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
          <ResponsiveImage
            media={{
              url: logo.url,
              variants: logo.variants,
              width: logo.width,
              height: logo.height,
              blurDataUrl: logo.blurDataUrl,
              altI18n: { fa: siteName, tr: siteName, en: siteName },
            }}
            locale={locale as "fa" | "tr" | "en"}
            sizes="120px"
            priority
            className="h-8"
            imgClassName="h-8 w-auto object-contain"
          />
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
