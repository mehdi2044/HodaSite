import { marketCodePattern, storefrontPath } from "./storefront-path";

/** A login destination, never an arbitrary URL supplied by a customer. */
export function customerReturnPath(
  value: string,
  locale: "fa" | "tr" | "en",
  market?: string,
) {
  const fallback = storefrontPath(locale, market, "account");
  if (value.length > 1500 || /%(?:2f|5c|0a|0d)/i.test(value)) return fallback;
  const local =
    /^\/(fa|tr|en)\/(checkout|fitting-room(?:\/coins)?|account(?:\/wishlist)?|orders\/[A-Z]{2}-[0-9]+\/pay)(?:\?market=([A-Za-z0-9_-]{1,40}))?$/.exec(
      value,
    );
  if (local) {
    const code = market ?? local[3];
    return storefrontPath(
      local[1],
      code && marketCodePattern.test(code) ? code : undefined,
      local[2],
    );
  }
  if (
    !/^\/(fa|tr|en)\/m\/[A-Za-z0-9_-]{1,40}\/p\/[^/?#\\]+(?:#stock-alert-[A-Za-z0-9_-]{1,100})?$/.test(
      value,
    )
  )
    return fallback;
  try {
    const url = new URL(value, "https://app.invalid");
    return url.origin === "https://app.invalid" &&
      url.pathname + url.hash === value
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}
