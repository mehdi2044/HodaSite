/** Presentation routing only. Never derives a product identity from a catalog list. */
export function storefrontNavigationRoute(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const offset = parts[1] === "m" ? 3 : 1;
  const page = parts[offset] ?? "";
  const tail = parts.slice(offset + 1);
  const suppressed =
    ["checkout", "payment", "payments"].includes(page) ||
    (page === "orders" && tail.length > 0);
  const active =
    page === "fitting-room"
      ? "fitting"
      : page === "account"
        ? tail[0] === "login"
          ? "login"
          : "profile"
        : page === "p"
          ? "product"
          : ["c", "search"].includes(page)
            ? "category"
            : page === ""
              ? "home"
              : null;
  return { page, suppressed, active, fitting: page === "fitting-room" };
}
