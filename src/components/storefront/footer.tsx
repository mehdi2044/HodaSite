import { getTranslations } from "next-intl/server";
import type { Market } from "@/lib/request-context";
import {
  SOCIAL_KEYS,
  type SocialByMarket,
  type MarketCode,
} from "@/lib/social";

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
}: {
  locale: string;
  market: Market;
  contact: Contact;
  social: SocialByMarket;
  legal: Legal;
}) {
  const t = await getTranslations("footer");
  const phone = contact.phones?.[market.code];
  const marketSocial = social[market.code as MarketCode] ?? {};
  const socialLinks = SOCIAL_KEYS.filter((key) => marketSocial[key]).map(
    (key) => [key, marketSocial[key] as string] as const,
  );
  const footerLine = legal.footerLine?.[locale];

  return (
    <footer className="mt-16 border-t border-black/5 bg-surface">
      <div className="shell grid gap-6 py-10 text-sm md:grid-cols-3">
        <div className="grid gap-1">
          <strong>{t("contactTitle")}</strong>
          {contact.email && (
            <bdi dir="ltr">
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </bdi>
          )}
          {phone && (
            <bdi dir="ltr">
              <a href={`tel:${phone}`}>{phone}</a>
            </bdi>
          )}
          {contact.address?.[locale] && (
            <p className="text-muted">{contact.address[locale]}</p>
          )}
        </div>
        {socialLinks.length > 0 && (
          <div className="grid gap-1">
            <strong>{t("socialTitle")}</strong>
            {socialLinks.map(([key, url]) => (
              <a key={key} href={url} target="_blank" rel="noreferrer">
                {t(key)}
              </a>
            ))}
          </div>
        )}
        {footerLine && (
          <div className="grid gap-1 text-muted">
            <p>{footerLine}</p>
          </div>
        )}
      </div>
    </footer>
  );
}
