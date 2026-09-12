import { normalizeThemeColors, safeColorMap } from "@/lib/theme-validation";
import { DEFAULT_LIGHT_COLORS } from "@/lib/theme-defaults";
import { PwaControls } from "@/components/pwa/controls";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { db } from "@/lib/db";
import { getSiteSettings, getThemeSettings } from "@/modules/settings";
import { normalizeBrand } from "@/lib/brand";
import { normalizeSocial } from "@/lib/social";
import { getRequestContext } from "@/lib/request-context";
import { Header } from "@/components/storefront/header";
import {
  Footer,
  type Contact,
  type Legal,
} from "@/components/storefront/footer";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { GeoSuggestionBanner } from "@/components/storefront/geo-suggestion-banner";

// Storefront pages stay dynamic so an admin's brand/theme change shows on the
// next load without a rebuild (Phase 00 acceptance criteria); market/locale
// resolution also depends on the request's cookies.
export const dynamic = "force-dynamic";
export async function generateViewport(): Promise<Viewport> {
  const theme = await getThemeSettings();
  const colors = safeColorMap(
    normalizeThemeColors(theme?.colors).light,
    DEFAULT_LIGHT_COLORS,
  );
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: colors.background,
  };
}

// <title>, <meta description>, favicon and og:site_name come from settings +
// the current market's SEO defaults (Phase 01a §2). A page further down the
// tree (product, category, …) can override this with its own
// generateMetadata in a later phase.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const [site, theme, { market }] = await Promise.all([
    getSiteSettings(),
    getThemeSettings(),
    getRequestContext(locale),
  ]);
  const brand = normalizeBrand(site?.brand);
  const siteName = brand.name[locale] ?? brand.name.fa ?? "STYLE HUB";
  const seo = (market?.seo ?? {}) as {
    title?: Record<string, string>;
    description?: Record<string, string>;
  };
  const favicon = theme?.faviconMediaId
    ? await db.media.findFirst({
        where: {
          id: theme.faviconMediaId,
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      })
    : null;

  return {
    title: seo.title?.[locale] || siteName,
    applicationName: siteName,
    manifest: `/pwa/${locale}/manifest.webmanifest${market ? `?market=${encodeURIComponent(market.code)}` : ""}`,
    appleWebApp: { capable: true, title: siteName, statusBarStyle: "default" },
    description: seo.description?.[locale] || undefined,
    icons: {
      ...(favicon ? { icon: favicon.url } : {}),
      apple: [
        { url: `/pwa/${locale}/icon/180`, sizes: "180x180", type: "image/png" },
      ],
    },
    openGraph: { siteName },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();
  const t = await getTranslations("mobileStorefront");

  const [site, theme, { market, markets }] = await Promise.all([
    getSiteSettings(),
    getThemeSettings(),
    getRequestContext(locale),
  ]);
  const brand = normalizeBrand(site?.brand);
  const siteName = brand.name[locale] ?? brand.name.fa ?? "";

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="storefront-app">
        <a className="storefront-skip-link" href="#storefront-content">
          {t("skipContent")}
        </a>
        <AnnouncementBar market={market} locale={locale} />
        <Header
          locale={locale}
          market={market}
          markets={markets}
          siteName={siteName}
          logoMediaId={theme?.logoMediaId}
          headerStyle={theme?.headerStyle ?? "minimal"}
        />
        <GeoSuggestionBanner
          currentMarketCode={market.code}
          markets={markets}
        />
        <div id="storefront-content" tabIndex={-1}>
          {children}
        </div>
        <PwaControls />
        <Footer
          locale={locale}
          market={market}
          contact={(site?.contact ?? {}) as Contact}
          social={normalizeSocial(site?.social)}
          legal={(site?.legal ?? {}) as Legal}
        />
      </div>
    </NextIntlClientProvider>
  );
}
