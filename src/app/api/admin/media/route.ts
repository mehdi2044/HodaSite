import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { listMedia } from "@/modules/media";

// JSON listing behind the MediaPicker's client-side search — the admin grid
// page itself reads listMedia() directly (SSR via searchParams), this route
// exists only for the modal's dynamic fetch. Read access only: any role that
// can upload media can browse/pick it.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await can(session.user.id, "media.upload")))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const parsedId = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .safeParse(id);
  if (id !== null && !parsedId.success)
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const mediaId = parsedId.success ? parsedId.data : undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const kind = url.searchParams.get("kind") ?? undefined;
  const folderId = url.searchParams.get("folderId") ?? undefined;

  const { items, total } = await listMedia({
    id: mediaId,
    q,
    kind,
    folderId,
    take: mediaId ? 1 : 60,
  });
  return NextResponse.json({
    total,
    items: items.map((m) => ({
      id: m.id,
      url: m.url,
      status: m.status,
      kind: m.kind,
      originalName: m.originalName,
      mime: m.mime,
      width: m.width,
      height: m.height,
      blurDataUrl: m.blurDataUrl,
      altI18n: m.altI18n,
      variants: m.variants,
      presentation: m.presentation,
      folderName: m.folder?.name ?? null,
    })),
  });
}
