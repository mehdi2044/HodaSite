import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { UnauthorizedError, ForbiddenError } from "@/modules/access";
import { prepareHomepagePreview } from "@/modules/content/private-homepage-preview";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie",
};
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin"),
    allowed = new Set([request.nextUrl.origin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  if (!origin || !allowed.has(origin))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers });
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers },
    );
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 128000)
    return NextResponse.json(
      { error: "INVALID_INPUT" },
      { status: 413, headers },
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
      await prepareHomepagePreview(session.user.id, raw),
      { headers },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
      return NextResponse.json(
        { error: "FORBIDDEN" },
        { status: 403, headers },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "INVALID_INPUT" },
        { status: 400, headers },
      );
    throw error;
  }
}
