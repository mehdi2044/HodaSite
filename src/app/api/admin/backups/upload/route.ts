import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/modules/auth";
import { ForbiddenError } from "@/modules/access";
import { assertBackupOwner } from "@/modules/backups/service";
import { beginUpload, appendUpload } from "@/modules/backups/uploads";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  if (!origin || !allowed.has(origin))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    await assertBackupOwner(session.user.id, "backup.upload");
    const id = req.nextUrl.searchParams.get("id");
    if (id)
      return NextResponse.json(
        await appendUpload(
          session.user.id,
          id,
          Number(req.nextUrl.searchParams.get("offset")),
          req.body,
        ),
      );
    const reader = req.body?.getReader();
    if (!reader) throw new Error("EMPTY");
    let text = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 2048) throw new Error("SIZE");
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const row = await beginUpload(session.user.id, JSON.parse(text));
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return NextResponse.json(
      { error: "UPLOAD_FAILED" },
      { status: e instanceof ForbiddenError ? 403 : 400 },
    );
  }
}
