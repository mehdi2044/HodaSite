import { ModaWordmark } from "./moda-wordmark";
import { getTranslations } from "next-intl/server";
import type { Market } from "@/lib/request-context";
import {
  SOCIAL_KEYS,
  type SocialByMarket,
  type MarketCode,
} from "@/lib/social";
import { getMenu, type PublicMenuItem } from "@/modules/content";
import { db } from "@/lib/db";
import { ResponsiveImage } from "./responsive-image";
import { Newsletter } from "./newsletter";
import {
  storefrontContact,
  storefrontSocialLink,
} from "@/lib/storefront-contact";

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
  logoMediaId,
  children,
}: {
  locale: string;
  market: Market;
  contact: Contact;
  social: SocialByMarket;
  legal: Legal;
  siteName?: string;
  logoMediaId?: string | null;
  children?: React.ReactNode;
}) {
  const [t, navT] = await Promise.all([
    getTranslations("footer"),
    getTranslations("contentNavigation"),
  ]);
  const { email, phone, address } = storefrontContact(
    market.supportChannels,
    contact,
    market.code,
    locale,
  );
  const code = market.code as MarketCode;
  const marketSocial = social[code] ?? {};
  const socialLinks = SOCIAL_KEYS.flatMap((key) => {
    const url = storefrontSocialLink(marketSocial[key], code, key);
    return url ? [[key, url] as const] : [];
  });
  const footerLine = legal.footerLine?.[locale];
  const menu = await getMenu(
    "footer",
    market.id,
    market.code,
    locale as "fa" | "tr" | "en",
  );
  const groups = menu.filter((item) => item.children.length > 0);
  const standalone = menu.filter((item) => item.children.length === 0);
  const logo = logoMediaId
    ? await db.media.findFirst({
        where: {
          id: logoMediaId,
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      })
    : null;

  return (
    <footer className="moda-footer" data-moda4="footer">
      <div className="moda-lace" aria-hidden="true" />
      <div className="moda-footer-top">
        {await Newsletter({ locale, marketId: market.id })}
      </div>
      <div className="moda-footer-links text-sm">
        {menu.length > 0 && (
          <nav aria-label={navT("footer")}>
            {groups.length > 0 && (
              <ul className="moda-footer-groups">
                {groups.map((item) => (
                  <li className="moda-footer-group" key={item.id}>
                    <div className="moda-footer-group-title">
                      <FooterMenuLink item={item} />
                    </div>
                    <ul>
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <FooterMenuLink item={child} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {standalone.length > 0 && (
              <ul className="moda-footer-directory">
                {standalone.map((item) => (
                  <li key={item.id}>
                    <FooterMenuLink item={item} />
                  </li>
                ))}
              </ul>
            )}
          </nav>
        )}
        {(email || phone || address || socialLinks.length > 0) && (
          <div className="moda-footer-contact">
            {(email || phone || address) && (
              <div className="grid gap-1">
                <strong>{t("contactTitle")}</strong>
                {email && (
                  <bdi dir="ltr">
                    <a href={`mailto:${email}`}>{email}</a>
                  </bdi>
                )}
                {phone && (
                  <bdi dir="ltr">
                    <a href={`tel:${phone}`}>{phone}</a>
                  </bdi>
                )}
                {address && <p className="opacity-70">{address}</p>}
              </div>
            )}
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
          </div>
        )}
      </div>
      <div className="moda-footer-wordmark" data-moda4="footer-wordmark">
        {logo?.originalName === "seed-moda4-logo.png" ? (
          <ModaWordmark />
        ) : logo ? (
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
            sizes="90vw"
            imgClassName="w-full h-auto object-contain"
          />
        ) : (
          <strong>{siteName}</strong>
        )}
      </div>
      {footerLine && <p className="moda-footer-legal">{footerLine}</p>}
      {children && <div className="moda-footer-utilities">{children}</div>}
    </footer>
  );
}

function FooterMenuLink({ item }: { item: PublicMenuItem }) {
  return item.href ? (
    <a
      href={item.href}
      target={item.target}
      rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
    >
      {item.label}
    </a>
  ) : (
    <span>{item.label}</span>
  );
}
