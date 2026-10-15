import type { ReactNode } from "react";
import type { PublicMenuItem } from "@/modules/content";

export function FooterView({
  homeHref,
  siteName,
  tagline,
  contact,
  socialLinks,
  menu,
  labels,
  footerLine,
  privacyControls,
}: {
  homeHref: string;
  siteName: string;
  tagline?: string;
  contact: { email?: string; phone?: string; address?: string; hours?: string };
  socialLinks: Array<{ key: string; label: string; href: string }>;
  menu: PublicMenuItem[];
  labels: {
    contact: string;
    social: string;
    navigation: string;
    links: string;
  };
  footerLine?: string;
  privacyControls?: ReactNode;
}) {
  const hasContact = Object.values(contact).some(Boolean);
  return (
    <footer className="shop-footer">
      <div className="shell shop-footer-main">
        {siteName && (
          <div className="shop-footer-brand">
            <a href={homeHref}>{siteName}</a>
            {tagline && <p>{tagline}</p>}
            <span className="shop-footer-brand-rule" aria-hidden="true" />
          </div>
        )}
        {menu.length > 0 && (
          <nav
            className="shop-footer-navigation"
            aria-label={labels.navigation}
          >
            <h2>{labels.links}</h2>
            <ul className="shop-footer-links">
              {menu.map((item) => (
                <FooterMenuItem key={item.id} item={item} />
              ))}
            </ul>
          </nav>
        )}
        {hasContact && (
          <div className="shop-footer-contact">
            <h2>{labels.contact}</h2>
            {contact.email && (
              <a href={`mailto:${contact.email}`}>
                <bdi dir="ltr">{contact.email}</bdi>
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`}>
                <bdi dir="ltr">{contact.phone}</bdi>
              </a>
            )}
            {contact.address && <p>{contact.address}</p>}
            {contact.hours && <p>{contact.hours}</p>}
          </div>
        )}
        {socialLinks.length > 0 && (
          <div className="shop-footer-social">
            <h2>{labels.social}</h2>
            <ul>
              {socialLinks.map((link) => (
                <li key={link.key}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                    <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {(footerLine || privacyControls) && (
        <div className="shell shop-footer-bottom">
          {footerLine && <p>{footerLine}</p>}
          {privacyControls}
        </div>
      )}
    </footer>
  );
}

function FooterMenuItem({ item }: { item: PublicMenuItem }) {
  return (
    <li>
      {item.href ? (
        <a
          href={item.href}
          target={item.target}
          rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
        >
          {item.label}
        </a>
      ) : (
        <span className="shop-footer-group-title">{item.label}</span>
      )}
      {item.children.length > 0 && (
        <ul>
          {item.children.map((child) => (
            <FooterMenuItem key={child.id} item={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
