import { currentServicePolicy } from "@/modules/content/service-policy";
import { ServicePolicySummary } from "./service-policy";
import type { Market } from "@/lib/request-context";
import { isSafeLink } from "@/modules/content";
import { LocaleSwitcher } from "./locale-switcher";
import { MarketSwitcher } from "./market-switcher";
import { getTranslations } from "next-intl/server";

export async function AnnouncementBar({
  market,
  locale,
  markets,
}: {
  market: Market;
  locale: string;
  markets: Market[];
}) {
  const bar = (market.announcementBar ?? {}) as {
    enabled?: boolean;
    text?: Record<string, string>;
    link?: string;
  };
  const policy = await currentServicePolicy(market.id);
  const text = bar.text?.[locale];
  const t = await getTranslations();

  return (
    <div className="moda-announcement" data-moda4="announcement">
      <div>
        {policy?.policy?.announcement ? (
          <ServicePolicySummary
            marketId={market.id}
            locale={locale as "fa" | "tr" | "en"}
            keys={["shipping"]}
            compact
          />
        ) : (
          bar.enabled &&
          text &&
          (bar.link && isSafeLink(bar.link) ? (
            <a
              href={bar.link}
              className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
            >
              {text}
            </a>
          ) : (
            text
          ))
        )}
      </div>
      <div className="moda-context-controls">
        <LocaleSwitcher
          current={locale}
          enabledLocales={market.enabledLocales}
          ariaLabel={t("locale.switchTo")}
          compact
        />
        <MarketSwitcher
          current={market.code}
          markets={markets}
          ariaLabel={t("market.chooseMarket")}
        />
      </div>
    </div>
  );
}
