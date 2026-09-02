import { db } from "@/lib/db";
import { NextResponse } from "next/server";
export async function GET() {
  let database = "down",
    lastBackup: null | string = null;
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
  } catch {}
  return NextResponse.json({
    db: database,
    storage: process.env.STORAGE_DRIVER ?? "local",
    lastBackup,
    lastFx: null,
  });
}
