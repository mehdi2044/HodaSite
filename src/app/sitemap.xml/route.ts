import { getSitemapIndex } from "@/modules/seo";
export const dynamic = "force-dynamic";
export async function GET() {
  return new Response(await getSitemapIndex(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
