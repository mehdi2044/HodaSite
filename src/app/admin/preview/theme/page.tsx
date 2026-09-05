import { getSiteSettings } from "@/modules/settings";
import { ThemePreviewClient } from "./preview-client";

// Admin-only (protected by the /admin/* middleware guard) and read-only — no
// mutation ever happens on this route (Phase 01a §3).
export const dynamic = "force-dynamic";

export default async function ThemePreviewPage() {
  const site = await getSiteSettings();
  const brand = (site?.brand ?? {}) as {
    name?: Record<string, string>;
    tagline?: Record<string, string>;
  };
  const name = brand.name?.fa ?? "STYLE HUB";
  const tagline = brand.tagline?.fa ?? "";

  return (
    <ThemePreviewClient>
      <main
        className="hero"
        dir="rtl"
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
          <p className="muted">پیش‌نمایش زندهٔ پوسته</p>
          <button className="button" type="button">
            دکمهٔ نمونه
          </button>
          <div className="card mt-4" style={{ maxWidth: 320, marginTop: 16 }}>
            <p style={{ margin: 0 }}>کارت نمونه با سطح، متن و گردی فعلی.</p>
          </div>
        </section>
      </main>
    </ThemePreviewClient>
  );
}
