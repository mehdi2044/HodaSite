import { resolveSlugRedirect } from "@/modules/seo/redirects";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return Response.json(
    { path: await resolveSlugRedirect(Object.fromEntries(query)) },
    { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}
