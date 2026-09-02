import "@/styles/tokens.css";
import { getLocale } from "next-intl/server";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // For /admin/* there is no locale in the URL, so next-intl resolves the
  // default (fa) — the admin panel is RTL.
  const locale = await getLocale();
  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"}>
      <body>{children}</body>
    </html>
  );
}
