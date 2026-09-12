import { open } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";
import { signValue, equalSecret } from "@/lib/secure-tokens";
import { backupKey } from "@/modules/backups/validation";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  try {
    await assertCan(session.user.id, "backup.view");
  } catch {
    return new Response(null, { status: 403 });
  }
  const key = backupKey.safeParse(req.nextUrl.searchParams.get("key"));
  const expires = Number(req.nextUrl.searchParams.get("expires"));
  if (
    !key.success ||
    !Number.isSafeInteger(expires) ||
    expires <= Date.now() ||
    expires > Date.now() + 300000 ||
    !equalSecret(
      signValue(`backup-download:${session.user.id}:${key.data}:${expires}`),
      req.nextUrl.searchParams.get("signature") ?? "",
    )
  )
    return new Response(null, { status: 403 });
  try {
    const handle = await open(
      path.join(
        process.env.BACKUP_ROOT ?? "/backups",
        "exports",
        `${key.data}.zip`,
      ),
      "r",
    );
    const stat = await handle.stat();
    if (!stat.isFile()) {
      await handle.close();
      return new Response(null, { status: 404 });
    }
    const stream = Readable.toWeb(
      handle.createReadStream({ autoClose: true }),
    ) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${key.data}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
