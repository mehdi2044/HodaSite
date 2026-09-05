import "@/styles/tokens.css";
import { getLocale } from "next-intl/server";
import { getThemeSettings } from "@/modules/settings";
import { DEFAULT_LIGHT_COLORS, BUTTON_RADIUS } from "@/lib/theme-defaults";
import {
  safeCssLength,
  safeColorMap,
  normalizeThemeColors,
} from "@/lib/theme-validation";

// Depends on the request (locale, and — via the theme accessor — the DB), so
// a brand/theme change is visible on the next load without a rebuild.
export const dynamic = "force-dynamic";

function toVars(colors: Record<string, string>): string {
  return Object.entries(colors)
    .map(([k, v]) => `--${k}:${v};`)
    .join("");
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // For /admin/* there is no locale in the URL, so next-intl resolves the
  // default (fa) — the admin panel is RTL.
  const locale = await getLocale();
  const theme = await getThemeSettings();

  // normalizeThemeColors accepts Phase 00's legacy flat shape too (a
  // backward-compat safety net alongside the data migration). Defense in
  // depth (Phase 01a PR review, P1): re-validate values already in the DB
  // before they reach dangerouslySetInnerHTML, not just at save time.
  const colors = normalizeThemeColors(theme?.colors);
  const light = safeColorMap(colors.light, DEFAULT_LIGHT_COLORS);
  const dark = safeColorMap(colors.dark, {});
  const darkMode = theme?.darkMode ?? "off";
  const buttonStyle = theme?.buttonStyle ?? "pill";
  const buttonRadius = BUTTON_RADIUS[buttonStyle] ?? BUTTON_RADIUS.pill;
  const radius = safeCssLength(theme?.radius, "12px");

  const rootVars = `${toVars(light)}--radius:${radius};--radius-button:${buttonRadius};`;
  const darkVars = Object.keys(dark).length
    ? toVars({ ...light, ...dark })
    : "";

  // Design tokens on <html> (architecture §3.2, D26): Tailwind v4's
  // `@theme inline` in tokens.css wires bg-primary/text-muted/etc to these.
  const css = [
    `:root{${rootVars}}`,
    darkMode === "on" && darkVars ? `:root{${darkVars}}` : "",
    darkMode === "system" && darkVars
      ? `@media (prefers-color-scheme: dark){:root{${darkVars}}}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <html
      lang={locale}
      dir={locale === "fa" ? "rtl" : "ltr"}
      data-button-style={buttonStyle}
    >
      <head>
        {/* Server-generated CSS vars from admin-controlled ThemeSettings, not user input. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {theme?.customCss && (
          // Sanitized at save time (src/lib/custom-css.ts), admin-authored only.
          <style dangerouslySetInnerHTML={{ __html: theme.customCss }} />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
