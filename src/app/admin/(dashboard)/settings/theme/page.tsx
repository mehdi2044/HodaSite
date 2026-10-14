import { getTranslations } from "next-intl/server";
import { getThemeSettings } from "@/modules/settings";
import { ThemeEditor, type ThemeDraft } from "./theme-editor";
import {
  DEFAULT_LIGHT_COLORS,
  DEFAULT_DARK_COLORS,
} from "@/lib/theme-defaults";
import {
  normalizeThemeColors,
  normalizeThemeFonts,
  safeLineOpacity,
  safeColorMap,
  BUTTON_STYLES,
} from "@/lib/theme-validation";

export default async function Theme() {
  const legacy = await getTranslations("foundationAdmin");

  const theme = await getThemeSettings();
  // Accepts Phase 00's legacy flat shape too (backward-compat safety net
  // alongside the data migration — PR #4 review, P1).
  const colors = normalizeThemeColors(theme?.colors);
  const fonts = normalizeThemeFonts(theme?.fonts);

  const initial: ThemeDraft = {
    light: safeColorMap(colors.light, DEFAULT_LIGHT_COLORS),
    dark: safeColorMap(colors.dark, DEFAULT_DARK_COLORS),
    radius: theme?.radius ?? "12px",
    darkMode: (theme?.darkMode as ThemeDraft["darkMode"]) ?? "off",
    headerStyle: (theme?.headerStyle as ThemeDraft["headerStyle"]) ?? "minimal",
    buttonStyle:
      BUTTON_STYLES.find((style) => style === theme?.buttonStyle) ?? "pill",
    heroStyle: theme?.heroStyle ?? "editorial",
    fontFa: fonts.fa ?? "Vazirmatn",
    fontLatin: fonts.latin ?? "Inter",
    fontHeadingLatin: fonts.headingLatin,
    fontPriceLatin: fonts.priceLatin,
    lineOpacity: safeLineOpacity(theme?.colors),
    customCss: theme?.customCss ?? "",
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">{legacy("theme")}</h1>
      <div className="mt-4">
        <ThemeEditor initial={initial} />
      </div>
    </>
  );
}
