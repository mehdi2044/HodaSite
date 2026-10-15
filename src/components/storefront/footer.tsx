import type { ReactNode } from "react";
import { FooterView } from "./footer-view";
import { getTranslations } from "next-intl/server";
import type { Market } from "@/lib/request-context";
import {
  SOCIAL_KEYS,
  type SocialByMarket,
  type MarketCode,
} from "@/lib/social";
import { getMenu } from "@/modules/content";

export type Contact = {
  email?: string;
  phones?: Record<string, string>;
  address?: Record<string, string>;
  hours?: Record<string, string>;
};
export type Legal = {
  companyName?: string;
  footerLine?: Record<string, string>;
};

export async function Footer({
  locale,
  market,
  contact,
  social,
  legal,
  siteName = "",
  tagline,
  privacyControls,
}: {
  locale: string;
  market: Market;
  contact: Contact;
  social: SocialByMarket;
  legal: Legal;
  siteName?: string;
  tagline?: string;
  privacyControls?: ReactNode;
}) {
  const [t, navT] = await Promise.all([
    getTranslations("footer"),
    getTranslations("contentNavigation"),
  ]);
  const phone = contact.phones?.[market.code];
  const marketSocial = social[market.code as MarketCode] ?? {};
  const socialLinks = SOCIAL_KEYS.filter((key) => marketSocial[key]).map(
    (key) => [key, marketSocial[key] as string] as const,
  );
  const footerLine = legal.footerLine?.[locale];
  const menu = await getMenu(
    "footer",
    market.id,
    market.code,
    locale as "fa" | "tr" | "en",
  );

  return (
    <FooterView
      homeHref={`/${locale}/m/${market.code}`}
      siteName={siteName}
      tagline={tagline}
      contact={{
        email: contact.email,
        phone,
        address: contact.address?.[locale],
        hours: contact.hours?.[locale],
      }}
      socialLinks={socialLinks.map(([key, href]) => ({
        key,
        href,
        label: t(key),
      }))}
      menu={menu}
      labels={{
        contact: t("contactTitle"),
        social: t("socialTitle"),
        navigation: navT("footer"),
        links: t("linksTitle"),
      }}
      footerLine={footerLine}
      privacyControls={privacyControls}
    />
  );
}
