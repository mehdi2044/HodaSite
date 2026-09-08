import { getTranslations } from "next-intl/server";
import type { Market } from "@/lib/request-context";
import {
  SOCIAL_KEYS,
  type SocialByMarket,
  type MarketCode,
} from "@/lib/social";
import { getMenu, type PublicMenuItem } from "@/modules/content";

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
    <footer className="mt-16 border-t border-black/5 bg-surface">
      <div className="shell grid gap-6 py-10 text-sm md:grid-cols-4">
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
        {menu.length > 0 && (
          <nav className="grid content-start gap-1" aria-label={navT("footer")}>
            {menu.map((item) => (
              <FooterMenuItem key={item.id} item={item} />
            ))}
          </nav>
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

function FooterMenuItem({ item }: { item: PublicMenuItem }) {
  return (
    <div className="grid gap-1">
      {item.href ? (
        <a
          className="min-h-11 py-3"
          href={item.href}
          target={item.target}
          rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
        >
          {item.label}
        </a>
      ) : (
        <span className="py-2 font-semibold text-muted">{item.label}</span>
      )}
      {item.children.map((child) => (
        <FooterMenuItem key={child.id} item={child} />
      ))}
    </div>
  );
}
