import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { previewCatalogCutout } from "@/modules/catalog/cutouts/preview";
export const dynamic = "force-dynamic";
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
  if (!(await can(session.user.id, "catalog.product.view")))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers });
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
  try {
    return NextResponse.json(
      { view: await previewCatalogCutout(raw) },
      { headers },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "INVALID_REFERENCE" },
        { status: 400, headers },
      );
    throw error;
  }
}
