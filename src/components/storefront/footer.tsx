import type { Market } from "@/lib/request-context";

export type Contact = {
  email?: string;
  phones?: Record<string, string>;
  address?: Record<string, string>;
  hours?: Record<string, string>;
};
export type Social = Partial<
  Record<
    | "instagram"
    | "telegram"
    | "whatsapp"
    | "x"
    | "tiktok"
    | "youtube"
    | "linkedin",
    string
  >
>;
export type Legal = {
  companyName?: string;
  footerLine?: Record<string, string>;
};

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "اینستاگرام",
  telegram: "تلگرام",
  whatsapp: "واتساپ",
  x: "X",
  tiktok: "تیک‌تاک",
  youtube: "یوتیوب",
  linkedin: "لینکدین",
};

export function Footer({
  locale,
  market,
  contact,
  social,
  legal,
}: {
  locale: string;
  market: Market;
  contact: Contact;
  social: Social;
  legal: Legal;
}) {
  const phone = contact.phones?.[market.code];
  const socialLinks = Object.entries(social).filter(([, url]) => Boolean(url));
  const footerLine = legal.footerLine?.[locale];

  return (
    <footer className="mt-16 border-t border-black/5 bg-surface">
      <div className="shell grid gap-6 py-10 text-sm md:grid-cols-3">
        <div className="grid gap-1">
          <strong>تماس با ما</strong>
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
            <strong>شبکه‌های اجتماعی</strong>
            {socialLinks.map(([key, url]) => (
              <a key={key} href={url} target="_blank" rel="noreferrer">
                {SOCIAL_LABELS[key] ?? key}
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
