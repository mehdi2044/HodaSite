import { notFound } from "next/navigation";
import { getSiteSettings, getThemeSettings } from "@/modules/settings";
import {
  getRuntimeMessages,
  type UiLocale,
} from "@/modules/content/translations";
import { normalizeBrand } from "@/lib/brand";
import { normalizeThemeColors, safeColorMap } from "@/lib/theme-validation";
import { DEFAULT_LIGHT_COLORS } from "@/lib/theme-defaults";

export function pwaLocale(value: string): UiLocale {
  if (value !== "fa" && value !== "tr" && value !== "en") notFound();
  return value;
}
export async function pwaPresentation(value: string) {
  const locale = pwaLocale(value);
  const [site, theme, messages] = await Promise.all([
    getSiteSettings(),
    getThemeSettings(),
    getRuntimeMessages(locale),
  ]);
  const brand = normalizeBrand(site?.brand);
  return {
    locale,
    name: brand.name[locale] || brand.name.fa || brand.name.en,
    colors: safeColorMap(
      normalizeThemeColors(theme?.colors).light,
      DEFAULT_LIGHT_COLORS,
    ),
    logoMediaId: theme?.faviconMediaId || theme?.logoMediaId,
    copy: messages.pwa as Record<string, string>,
  };
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
