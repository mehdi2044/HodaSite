import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceForBuild } from "@/modules/pwa/worker";
export const dynamic = "force-dynamic";
export async function GET() {
  const buildId = await readFile(
    join(process.cwd(), ".next/BUILD_ID"),
    "utf8",
  ).catch(() => "development");
  return new Response(sourceForBuild(buildId), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
