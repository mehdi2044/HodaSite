import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { shoppableSceneSchema } from "@/modules/content/scenes/contracts";
import { resolveShoppableScene } from "@/modules/content/scenes/resolve";
export const dynamic = "force-dynamic";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const input = z
  .object({
    scopeMarketId: id.nullable(),
    marketId: id,
    locale: z.enum(["fa", "tr", "en"]),
    scene: shoppableSceneSchema,
  })
  .strict();
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie",
};
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers },
    );
  const body = await request.text();
  if (body.length > 128000)
    return NextResponse.json(
      { error: "INVALID_INPUT" },
      { status: 400, headers },
    );
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: "INVALID_INPUT" },
      { status: 400, headers },
    );
  }
  const parsed = input.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_INPUT" },
      { status: 400, headers },
    );
  const { scopeMarketId, marketId, locale, scene } = parsed.data;
  if (
    !(await can(
      session.user.id,
      "content.homepage.read",
      scopeMarketId ? { marketId: scopeMarketId } : undefined,
    )) ||
    (scopeMarketId && marketId !== scopeMarketId)
  )
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers });
  const market = await db.market.findFirst({
    where: { id: marketId, isActive: true, enabledLocales: { has: locale } },
  });
  if (!market)
    return NextResponse.json(
      { error: "INVALID_MARKET" },
      { status: 400, headers },
    );
  return NextResponse.json(
    {
      view: await resolveShoppableScene(scene, market, locale, {
        adminPreview: true,
      }),
    },
    { headers },
  );
}
