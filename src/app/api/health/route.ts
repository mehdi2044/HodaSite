import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  let database = "down";
  let reason: string | undefined;
  let lastBackup: string | null = null;

  try {
    await db.$queryRaw`SELECT 1`;
    database = "ok";
    lastBackup =
      (
        await db.backup.findFirst({
          where: { status: "DONE" },
          orderBy: { finishedAt: "desc" },
        })
      )?.finishedAt?.toISOString() ?? null;
  } catch (err) {
    reason = err instanceof Error ? err.message : "unknown error";
    console.error("[health] database check failed:", err);
  }

  return NextResponse.json(
    {
      db: database,
      ...(reason ? { reason } : {}),
      storage: process.env.STORAGE_PROVIDER ?? "local",
      lastBackup,
      lastFx: null,
    },
    { status: database === "ok" ? 200 : 503 },
  );
}
