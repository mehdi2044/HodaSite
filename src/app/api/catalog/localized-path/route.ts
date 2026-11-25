import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/request-context";
import { marketCodePattern } from "@/lib/storefront-path";
import { parseSeoPath } from "@/lib/seo-urls";
import { localizedStorefrontPath } from "@/modules/catalog/navigation";

export const dynamic = "force-dynamic";
const input = z.object({
  pathname: z
    .string()
    .max(1024)
    .regex(
      /^\/(fa|tr|en)\/(?:m\/[A-Za-z0-9_-]{1,40}\/)?(?:(?:p|c|pages)\/[^/?#]+|(?:looks|magazine)(?:\/[^/?#]+)?)\/?$/,
    ),
  target: z.enum(["fa", "tr", "en"]),
  destination: z.string().regex(marketCodePattern).optional(),
});
export async function GET(request: Request) {
  const parsed = input.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
  };
  if (!parsed.success)
    return NextResponse.json({ href: null }, { status: 400, headers });
  const { pathname, target, destination } = parsed.data;
  const source = pathname.split("/")[1];
  const context = await getRequestContext(source);
  const route = parseSeoPath(pathname);
  const market = route
    ? context.markets.find(
        (m) =>
          m.code === route.market &&
          m.isActive &&
          m.enabledLocales.includes(source),
      )
    : context.market;
  const selected = destination
    ? context.markets.find((m) => m.code === destination && m.isActive)
    : market;
  const href =
    market && selected
      ? await localizedStorefrontPath(pathname, target, market, selected)
      : null;
  return NextResponse.json({ href }, { headers });
}
