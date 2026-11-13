import type { MarketCode, SocialKey } from "./social";

type PublicContact = { email?: string; phones?: Record<string, string> };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Only an explicitly market-scoped address can identify a local storefront. */
export function storefrontContact(
  support: unknown,
  legacy: PublicContact,
  market: string,
  locale: string,
) {
  const data = (support ?? {}) as Record<string, unknown>;
  const email = text(data.email ?? legacy.email);
  const phone = text(data.phone ?? legacy.phones?.[market]);
  const digits = phone.replace(/\D/g, "");
  return {
    email:
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      !/@(?:[^@]+\.)?example\.(?:com|net|org)$/i.test(email)
        ? email
        : "",
    phone:
      /^[+\d() .-]+$/.test(phone) && digits.length >= 7 && !/0{7}$/.test(digits)
        ? phone
        : "",
    address: text(data[`address${locale[0]?.toUpperCase()}${locale.slice(1)}`]),
  };
}

const seedProfiles: Partial<
  Record<MarketCode, Partial<Record<SocialKey, string>>>
> = {
  IR: { instagram: "instagram.com/stylehub.ir", telegram: "t.me/stylehub" },
  TR: { instagram: "instagram.com/stylehub.tr" },
  CA: { instagram: "instagram.com/stylehub" },
};

export function storefrontSocialLink(
  value: string | undefined,
  market: MarketCode,
  key: SocialKey,
) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const profile = (
      url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "")
    ).toLowerCase();
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/(?:^|\.)example\.(?:com|net|org)$/i.test(url.hostname) &&
      profile !== seedProfiles[market]?.[key]
    )
      return value;
  } catch {
    return undefined;
  }
}
