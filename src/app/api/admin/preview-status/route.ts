import { NextResponse } from "next/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { getPreviewStatus, previewEnabled } from "@/modules/settings";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET() {
  if (!previewEnabled())
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers },
    );
  if (!(await can(session.user.id, "system.health.view")))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  try {
    return NextResponse.json(await getPreviewStatus(), { headers });
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers },
    );
  }
}
