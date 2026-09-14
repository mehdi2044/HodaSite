import { z } from "zod";
import { aiAccess, sessionActor } from "./access";
import { completeTask } from "./gateway";
import { financeDashboard } from "@/modules/finance/dashboard";
const narrative = z
  .object({
    summary: z.string().max(6000),
    anomalies: z.array(z.string().max(1000)).max(12),
  })
  .strict();
export async function financialSummary(raw: unknown) {
  const v = z
    .object({
      marketId: z.string().min(1).max(100).optional(),
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      locale: z.enum(["fa", "tr", "en"]),
      requestKey: z.string().min(8).max(100),
    })
    .strict()
    .parse(raw);
  const actor = await sessionActor();
  await aiAccess(
    actor,
    "ai.finance.analyze",
    v.marketId ? { marketId: v.marketId } : {},
  );
  const [year, month] = v.month.split("-").map(Number),
    start = `${v.month}-01`,
    end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const report = await financeDashboard({
    marketId: v.marketId,
    from: start,
    to: end,
  });
  return completeTask({
    actor,
    feature: "finance",
    marketId: v.marketId,
    requestKey: v.requestKey,
    schema: narrative,
    data: {
      period: v.month,
      locale: v.locale,
      aggregates: report.totals,
      instructions:
        "Read-only monthly management summary and anomalies. All amounts are four-decimal TRY or USD as named. No raw records are available. Never claim a trend against an absent prior period or claim all sales were recognized. Mention that only posted accounting within the configured cutover is included; general expenses appear only in consolidated totals.",
    },
  });
}
