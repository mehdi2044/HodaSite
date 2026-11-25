/** Small interface symbols; labels are supplied by the parent control. */
export function StorefrontIcon({
  name,
}: {
  name:
    | "home"
    | "search"
    | "cart"
    | "account"
    | "menu"
    | "category"
    | "fitting"
    | "more";
}) {
  const paths = {
    home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    cart: "M5 7h14l1 14H4L5 7Zm3 0V6a4 4 0 0 1 8 0v1",
    account:
      "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    menu: "M4 6h16M4 12h16M4 18h16",
    category: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    fitting:
      "M10 7a2 2 0 1 1 4 0c0 1-2 1.5-2 3v1m0 0 8 5.5a1.4 1.4 0 0 1-.8 2.5H4.8a1.4 1.4 0 0 1-.8-2.5L12 11Z",
    more: "M5 12h.1M12 12h.1M19 12h.1",
  };
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
