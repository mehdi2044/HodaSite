import { normalizeBrand } from "@/lib/brand";
import { getLocale, getTranslations } from "next-intl/server";
import { getSiteSettings } from "@/modules/settings";
import { ThemePreviewClient } from "./preview-client";

// Admin-only (protected by the /admin/* middleware guard) and read-only — no
// mutation ever happens on this route (Phase 01a §3).
export const dynamic = "force-dynamic";

export default async function ThemePreviewPage() {
  const legacy = await getTranslations("foundationAdmin");

  const site = await getSiteSettings();
  const locale = await getLocale();
  const brand = normalizeBrand(site?.brand);
  const name = brand.name[locale as "fa" | "tr" | "en"] || brand.name.fa;
  const tagline = brand.tagline[locale as "fa" | "tr" | "en"];

  return (
    <ThemePreviewClient>
      <main
        className="hero"
        dir={locale === "fa" ? "rtl" : "ltr"}
        style={{ minHeight: "auto", padding: "32px 0" }}
      >
        <section className="shell">
          {tagline && (
            <p style={{ letterSpacing: ".16em", color: "var(--primary)" }}>
              {tagline}
            </p>
          )}
          <h1 style={{ fontSize: "clamp(2rem,10vw,3.5rem)", margin: 0 }}>
            {name}
          </h1>
          <p className="muted">{legacy("preview")}</p>
          <button className="button" type="button">
            {" "}
            {legacy("sampleButton")}{" "}
          </button>
          <div className="card mt-4" style={{ maxWidth: 320, marginTop: 16 }}>
            <p style={{ margin: 0 }}>{legacy("sampleCard")}</p>
          </div>
        </section>
      </main>
    </ThemePreviewClient>
  );
}
