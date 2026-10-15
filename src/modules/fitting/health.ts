import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { configSchema } from "./contracts";

const KNOWN_ERRORS = new Set([
  "DISABLED",
  "PROVIDER_FAILED",
  "PROVIDER_UNKNOWN",
  "INTERRUPTED",
  "OUTPUT_INTERRUPTED",
  "ADMIN_REFUND",
]);
const FIVE_MINUTES = 5 * 60_000;
/** Queue evidence is not proof of a cron heartbeat or provider availability. */
export async function fittingDiagnostics(actorId: string, now = new Date()) {
  await assertCan(actorId, "system.health.view");
  const since = new Date(now.getTime() - 86_400_000);
  const stale = new Date(now.getTime() - FIVE_MINUTES);
  const evidence = await db.$transaction(
    async (tx) => {
      const [
        integration,
        sessions,
        jobs,
        queued,
        running,
        oldestQueued,
        oldestRunning,
        lastJob,
        refunds,
        errors,
      ] = await Promise.all([
        tx.integration.findUnique({
          where: { key: "fitting-room" },
          select: { isActive: true, config: true },
        }),
        tx.fittingSession.groupBy({
          by: ["status"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        tx.job.groupBy({
          by: ["status"],
          where: { type: "fitting-render" },
          _count: { _all: true },
        }),
        tx.fittingSession.count({
          where: { status: "QUEUED", createdAt: { lte: stale } },
        }),
        tx.fittingSession.count({
          where: {
            status: "RUNNING",
            OR: [
              { startedAt: { lte: stale } },
              { startedAt: null, updatedAt: { lte: stale } },
            ],
          },
        }),
        tx.fittingSession.findFirst({
          where: { status: "QUEUED" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        tx.fittingSession.findFirst({
          where: { status: "RUNNING" },
          orderBy: { startedAt: "asc" },
          select: { startedAt: true, updatedAt: true },
        }),
        tx.job.findFirst({
          where: { type: "fitting-render", status: "DONE" },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        tx.fittingCoinEntry.count({
          where: { reason: "FAILED_REFUND", createdAt: { gte: since } },
        }),
        tx.fittingSession.groupBy({
          by: ["errorCode"],
          where: { updatedAt: { gte: since }, errorCode: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const parsed = configSchema.safeParse(integration?.config ?? {});
      const models = parsed.success ? parsed.data.models : [];
      const mediaIds = [...new Set(models.map((model) => model.mediaId))];
      const readyModels = await tx.media.count({
        where: {
          id: { in: mediaIds },
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      });
      const safeErrors: Record<string, number> = {};
      for (const error of errors) {
        const code =
          error.errorCode && KNOWN_ERRORS.has(error.errorCode)
            ? error.errorCode
            : "OTHER";
        safeErrors[code] = (safeErrors[code] ?? 0) + error._count._all;
      }
      const counts = (
        rows: { status: string; _count: { _all: number } }[],
        allowed: readonly string[],
      ) =>
        Object.fromEntries(
          allowed.map((status) => [
            status,
            rows.find((row) => row.status === status)?._count._all ?? 0,
          ]),
        );
      return {
        enabled:
          !!integration?.isActive && parsed.success && parsed.data.enabled,
        configValid: parsed.success,
        models: mediaIds.length,
        readyModels,
        sessions24h: counts(sessions, [
          "QUEUED",
          "RUNNING",
          "DONE",
          "FAILED",
          "REVIEW",
        ]),
        jobs: counts(jobs, ["PENDING", "RUNNING", "DONE", "FAILED"]),
        delayedQueued: queued,
        delayedRunning: running,
        oldestQueuedAt: oldestQueued?.createdAt.toISOString() ?? null,
        oldestRunningAt:
          (
            oldestRunning?.startedAt ?? oldestRunning?.updatedAt
          )?.toISOString() ?? null,
        lastCompletedJobAt: lastJob?.updatedAt.toISOString() ?? null,
        refunds24h: refunds,
        errors24h: safeErrors,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
  return {
    observedAt: now.toISOString(),
    ...evidence,
    credentialPresent: Boolean(
      process.env.FITTING_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    ),
    cronSecretPresent: Boolean(process.env.CRON_SECRET),
    schedulerHeartbeat: "UNVERIFIED" as const,
    providerConnection: "UNVERIFIED" as const,
    storage: process.env.STORAGE_PROVIDER === "s3" ? "s3" : "local",
    storageConfigurationPresent:
      process.env.STORAGE_PROVIDER !== "s3" ||
      Boolean(
        process.env.S3_ENDPOINT &&
        process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY &&
        process.env.S3_SECRET_KEY,
      ),
    storageConnection: "UNVERIFIED" as const,
  };
}
