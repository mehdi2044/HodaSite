import { getTranslations } from "next-intl/server";
import { getSiteSettings } from "@/modules/settings";
import { normalizeBrand } from "@/lib/brand";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  const site = await getSiteSettings();
  const brand = normalizeBrand(site?.brand);
  const siteName = brand.name[locale] ?? brand.name.fa ?? "STYLE HUB";

  return (
    <main className="hero" dir={locale === "fa" ? "rtl" : "ltr"}>
      <section className="shell">
        <p style={{ letterSpacing: ".16em", color: "var(--primary)" }}>
          {t("tagline")}
        </p>
        <h1 style={{ fontSize: "clamp(3rem,12vw,8rem)", margin: 0 }}>
          {siteName}
        </h1>
        <p className="muted" style={{ fontSize: "1.2rem" }}>
          {t("welcome")}
          <br />
          {t("soon")}
        </p>
        <button className="button">{t("explore")}</button>
      </section>
    </main>
  );
}
