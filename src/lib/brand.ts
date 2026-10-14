export type BrandI18n = {
  name: Record<string, string>;
  tagline: Record<string, string>;
};

/** Only numeric presentation settings are accepted from persisted brand JSON. */
export function brandLogoWidth(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 160;
  const width = (raw as { logoWidth?: unknown }).logoWidth;
  return typeof width === "number" &&
    Number.isFinite(width) &&
    width >= 80 &&
    width <= 240
    ? width
    : 160;
}

/**
 * Normalizes SiteSettings.brand — accepts either the current shape
 * ({name,tagline}) or Phase 00's legacy flat {fa,tr,en} shape, so a row that
 * somehow slipped past the data migration
 * (prisma/migrations/20260905010000_phase01a_data_migration_brand_colors)
 * still renders correctly instead of silently falling back to empty
 * strings (PR #4 review, P1 — defense in depth at the reader).
 */
export function normalizeBrand(raw: unknown): BrandI18n {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.name && typeof b.name === "object") {
    return {
      name: b.name as Record<string, string>,
      tagline: (b.tagline as Record<string, string> | undefined) ?? {
        fa: "",
        tr: "",
        en: "",
      },
    };
  }
  // Legacy flat {fa,tr,en} shape.
  return {
    name: {
      fa: typeof b.fa === "string" ? b.fa : "",
      tr: typeof b.tr === "string" ? b.tr : "",
      en: typeof b.en === "string" ? b.en : "",
    },
    tagline: { fa: "", tr: "", en: "" },
  };
}
