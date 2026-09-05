import { getThemeSettings } from "@/modules/settings";
import { ThemeEditor, type ThemeDraft } from "./theme-editor";
import {
  DEFAULT_LIGHT_COLORS,
  DEFAULT_DARK_COLORS,
} from "@/lib/theme-defaults";

export default async function Theme() {
  const theme = await getThemeSettings();
  const colors = (theme?.colors ?? {}) as {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  const fonts = (theme?.fonts ?? {}) as { fa?: string; latin?: string };

  const initial: ThemeDraft = {
    light: { ...DEFAULT_LIGHT_COLORS, ...colors.light },
    dark: { ...DEFAULT_DARK_COLORS, ...colors.dark },
    radius: theme?.radius ?? "12px",
    darkMode: (theme?.darkMode as ThemeDraft["darkMode"]) ?? "off",
    headerStyle: (theme?.headerStyle as ThemeDraft["headerStyle"]) ?? "minimal",
    buttonStyle: (theme?.buttonStyle as ThemeDraft["buttonStyle"]) ?? "pill",
    heroStyle: theme?.heroStyle ?? "editorial",
    fontFa: fonts.fa ?? "Vazirmatn",
    fontLatin: fonts.latin ?? "Inter",
    customCss: theme?.customCss ?? "",
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">پوسته</h1>
      <div className="mt-4">
        <ThemeEditor initial={initial} />
      </div>
    </>
  );
}
