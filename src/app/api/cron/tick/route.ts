import { runJobs } from "@/modules/jobs";
import { NextResponse } from "next/server";
import { isMaintenanceOn } from "@/modules/settings";
import { enterRequest, leaveRequest } from "@/lib/request-metrics";
import { registerMediaJobHandlers } from "@/modules/media/optimize";
import {
  registerMediaPurgeHandler,
  ensurePurgeSweepScheduled,
} from "@/modules/media/purge";
import { registerMediaReplaceHandler } from "@/modules/media/replace";

// Registers the media job handlers once, when this route module first loads
// (D21 — DB-backed queue, no Redis/BullMQ). Deliberately NOT in
// instrumentation.ts: that file compiles through a separate webpack pass that
// does not honor next.config.ts's `serverExternalPackages`, so importing
// `sharp` there (even transitively, via optimize.ts) crashed at boot trying
// to statically resolve sharp's platform-conditional requires (confirmed
// against the real Docker image). A normal Route Handler does respect
// serverExternalPackages. Only registerMediaJobHandlers() (synchronous, no
// I/O) runs at module scope — `next build` actually imports/executes route
// modules while collecting page data, so anything touching the database
// (ensurePurgeSweepScheduled) must wait for a real request instead.
registerMediaJobHandlers();
registerMediaPurgeHandler();
registerMediaReplaceHandler();

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Count first, then check maintenance (A8 ordering, Vee).
  enterRequest();
  try {
    // Don't process the job queue while a restore is in progress.
    if (await isMaintenanceOn())
      return NextResponse.json({ skipped: "maintenance" }, { status: 503 });
    await ensurePurgeSweepScheduled();
    return NextResponse.json({ processed: await runJobs() });
  } finally {
    leaveRequest();
  }
}
