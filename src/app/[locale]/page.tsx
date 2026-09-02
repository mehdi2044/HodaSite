import { notFound } from "next/navigation";
import { getAppearance } from "@/modules/settings";
const locales = ["fa", "tr", "en"] as const;
type Locale = (typeof locales)[number];
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const [site, theme] = await getAppearance();
  const brand = (site?.brand ?? {}) as Record<string, string>;
  const colors = (theme?.colors ?? {}) as Record<string, string>;
  return (
    <main
      className="hero"
      dir={locale === "fa" ? "rtl" : "ltr"}
      style={{ ["--primary" as string]: colors.primary ?? "#E8792A" }}
    >
      <section className="shell">
        <p style={{ letterSpacing: ".16em", color: "var(--primary)" }}>
          {messages.tagline}
        </p>
        <h1 style={{ fontSize: "clamp(3rem,12vw,8rem)", margin: 0 }}>
          {brand[locale] ?? "STYLE HUB"}
        </h1>
        <p className="muted" style={{ fontSize: "1.2rem" }}>
          {messages.welcome}
          <br />
          {messages.soon}
        </p>
        <button className="button">{messages.explore}</button>
        <p>
          <bdi dir="ltr">SH-MW-1023</bdi>
        </p>
      </section>
    </main>
  );
}
