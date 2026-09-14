import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { keyStatus } from "@/modules/integrations/ai";
import { sessionActor, aiAccess } from "./access";
import { configSchema } from "./contracts";
import { readConfig, lockAi, monthBounds } from "./gateway";
export async function aiSettings() {
  const actor = await sessionActor();
  await aiAccess(actor, "ai.settings.manage");
  const config = await readConfig(),
    prompts = await db.promptVersion.findMany({
      distinct: ["feature"],
      orderBy: [{ feature: "asc" }, { version: "desc" }],
    });
  return { config, prompts, keys: keyStatus() };
}
export async function saveAiSettings(raw: unknown) {
  const v = z
    .object({
      config: configSchema,
      style: z.string().trim().min(1).max(4000),
      forbiddenClaims: z.string().trim().max(2000),
      feature: z.enum(["product", "finance"]),
      confirm: z.literal(true),
    })
    .strict()
    .parse(raw);
  const actor = await sessionActor();
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await aiAccess(actor, "ai.settings.manage", {}, tx);
      await lockAi(tx);
      await tx.integration.upsert({
        where: { key: "ai" },
        create: {
          key: "ai",
          provider: v.config.provider,
          isActive: v.config.enabled,
          config: v.config,
        },
        update: {
          provider: v.config.provider,
          isActive: v.config.enabled,
          config: v.config,
        },
      });
      const last = await tx.promptVersion.findFirst({
        where: { feature: v.feature },
        orderBy: { version: "desc" },
      });
      if (
        !last ||
        last.style !== v.style ||
        last.forbiddenClaims !== v.forbiddenClaims
      )
        await tx.promptVersion.create({
          data: {
            feature: v.feature,
            version: (last?.version ?? 0) + 1,
            style: v.style,
            forbiddenClaims: v.forbiddenClaims,
            createdBy: actor,
          },
        });
      await tx.auditLog.create({
        data: {
          userId: actor,
          action: "ai.settings.save",
          entityType: "Integration",
          entityId: "ai",
          after: { config: v.config, promptFeature: v.feature },
        },
      });
    }),
  );
}
export async function usageReport(marketId?: string) {
  const actor = await sessionActor();
  await aiAccess(actor, "ai.usage.view", marketId ? { marketId } : {});
  const { start, end } = monthBounds(new Date());
  const where = {
    ...(marketId ? { marketId } : {}),
    createdAt: { gte: start, lt: end },
  };
  const [totals, rows] = await Promise.all([
    db.aiUsage.aggregate({
      where,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    db.aiUsage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        feature: true,
        provider: true,
        model: true,
        status: true,
        costUsd: true,
        inputTokens: true,
        outputTokens: true,
        createdAt: true,
        errorCode: true,
      },
    }),
  ]);
  return {
    start: start.toISOString(),
    totalUsd: totals._sum.costUsd?.toFixed(4) ?? "0.0000",
    count: totals._count,
    rows: rows.map((r) => ({
      ...r,
      costUsd: r.costUsd.toFixed(4),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
