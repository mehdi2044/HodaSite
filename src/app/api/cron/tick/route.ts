import { runJobs } from "@/modules/jobs";
import { NextResponse } from "next/server";
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ processed: await runJobs() });
}
