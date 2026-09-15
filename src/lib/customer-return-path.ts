/** A login destination, never an arbitrary URL supplied by a customer. */
export function customerReturnPath(value: string, locale: "fa" | "tr" | "en") {
  const fallback = `/${locale}/account`;
  if (value.length > 1500 || /%(?:2f|5c|0a|0d)/i.test(value)) return fallback;
  if (
    /^\/(fa|tr|en)\/(checkout|account\/wishlist|orders\/[A-Z]{2}-[0-9]+\/pay)$/.test(
      value,
    )
  )
    return value;
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
