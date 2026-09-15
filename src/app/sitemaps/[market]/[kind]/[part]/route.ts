import { getSitemapPage } from "@/modules/seo";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ market: string; kind: string; part: string }> },
) {
  const { market, kind, part } = await params;
  const xml = await getSitemapPage(market, kind, part);
  return new Response(xml, {
    status: xml === null ? 404 : 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
