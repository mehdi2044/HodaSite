import { getSeoSettings } from "@/modules/seo";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = await getSeoSettings();
  const body = config.indexingEnabled
    ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /*/account\nDisallow: /*/cart\nDisallow: /*/checkout\nDisallow: /*/orders\nDisallow: /*/tracking\nDisallow: /*/search\nDisallow: /*?*preview=\nSitemap: ${config.origin}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
