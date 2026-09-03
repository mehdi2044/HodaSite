import { runJobs } from "@/modules/jobs";
import { NextResponse } from "next/server";
import { isMaintenanceOn } from "@/modules/settings";
import { enterRequest, leaveRequest } from "@/lib/request-metrics";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Count first, then check maintenance (A8 ordering, Vee).
  enterRequest();
  try {
    // Don't process the job queue while a restore is in progress.
    if (await isMaintenanceOn())
      return NextResponse.json({ skipped: "maintenance" }, { status: 503 });
    return NextResponse.json({ processed: await runJobs() });
  } finally {
    leaveRequest();
  }
}
