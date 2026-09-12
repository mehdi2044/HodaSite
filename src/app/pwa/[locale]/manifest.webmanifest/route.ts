import { getMarkets } from "@/modules/settings";
import { pwaPresentation } from "@/modules/pwa/presentation";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const p = await pwaPresentation(locale);
  const requested = new URL(_request.url).searchParams.get("market");
  const market = (await getMarkets()).find(
    (m) =>
      m.code === requested && m.isActive && m.enabledLocales.includes(locale),
  );
  return Response.json(
    {
      id: "/",
      name: p.name,
      short_name: p.name.slice(0, 32),
      description: p.copy.description,
      lang: locale,
      dir: locale === "fa" ? "rtl" : "ltr",
      start_url: `/${locale}${market ? `?market=${encodeURIComponent(market.code)}` : ""}`,
      scope: "/",
      display: "standalone",
      background_color: p.colors.background,
      theme_color: p.colors.background,
      prefer_related_applications: false,
      icons: [192, 512].map((size) => ({
        src: `/pwa/${locale}/icon/${size}`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any maskable",
      })),
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
