import { db } from "@/lib/db";
import { getActiveRate, isRateStale } from "@/modules/pricing";
export const BACKUP_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export function recentBackup(at: Date | null | undefined, now = new Date()) {
  return Boolean(
    at && at <= now && now.getTime() - at.getTime() <= BACKUP_MAX_AGE_MS,
  );
}
export function offsiteHealthy(
  backup: { offsiteStatus: string; offsiteSyncedAt: Date | null } | null,
  now = new Date(),
) {
  return (
    backup?.offsiteStatus === "OK" && recentBackup(backup.offsiteSyncedAt, now)
  );
}
type Alert = {
  code: string;
  message: string;
  severity: "WARNING" | "CRITICAL";
};
export type HealthSnapshot = {
  lastBackupAt: Date | null;
  offsiteOk: boolean;
  lowStock: number;
  overdueUnpaid: number;
  failedJobs: number;
  staleMarkets: string[];
};
export function operationalAlerts(
  snapshot: HealthSnapshot,
  now = new Date(),
): Alert[] {
  const result: Alert[] = [];
  if (!recentBackup(snapshot.lastBackupAt, now))
    result.push({
      code: "HEALTH_BACKUP_STALE",
      message: "backupStale",
      severity: "CRITICAL",
    });
  if (!snapshot.offsiteOk)
    result.push({
      code: "HEALTH_OFFSITE_STALE",
      message: "offsiteStale",
      severity: "CRITICAL",
    });
  if (snapshot.lowStock > 0)
    result.push({
      code: "HEALTH_LOW_STOCK",
      message: "lowStock",
      severity: "WARNING",
    });
  if (snapshot.overdueUnpaid > 0)
    result.push({
      code: "HEALTH_UNPAID_BACKLOG",
      message: "unpaidBacklog",
      severity: "WARNING",
    });
  if (snapshot.failedJobs > 0)
    result.push({
      code: "HEALTH_FAILED_JOBS",
      message: "failedJobsAlert",
      severity: "WARNING",
    });
  for (const code of snapshot.staleMarkets)
    result.push({
      code: `HEALTH_FX_STALE_${code}`,
      message: "staleFx",
      severity: "WARNING",
    });
  return result;
}
/** Cron-owned synchronization: retain resolved history, avoid one alert/minute. */
export async function persistOperationalAlerts(
  alerts: Alert[],
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('hoda-health-alerts'))`;
    const existing = await tx.systemAlert.findMany({
      where: { code: { startsWith: "HEALTH_" }, resolvedAt: null },
    });
    const codes = new Set(alerts.map((a) => a.code));
    await tx.systemAlert.updateMany({
      where: {
        id: { in: existing.filter((a) => !codes.has(a.code)).map((a) => a.id) },
      },
      data: { resolvedAt: now },
    });
    for (const alert of alerts)
      if (!existing.some((a) => a.code === alert.code))
        await tx.systemAlert.create({ data: { ...alert, createdAt: now } });
  });
}
export async function syncOperationalAlerts(now = new Date()) {
  const [last, settings, markets, overdueUnpaid, failedJobs] =
    await Promise.all([
      db.backup.findFirst({
        where: { status: "DONE" },
        orderBy: { finishedAt: "desc" },
      }),
      db.siteSettings.findUnique({
        where: { id: "default" },
        select: { inventory: true },
      }),
      db.market.findMany({
        where: { isActive: true },
        select: { id: true, code: true, fxStaleHours: true },
      }),
      db.order.count({
        where: {
          status: {
            in: ["PENDING_PAYMENT", "AWAITING_VERIFICATION", "NEEDS_REVIEW"],
          },
          paymentDeadlineAt: { lt: now },
        },
      }),
      db.job.count({ where: { status: "FAILED" } }),
    ]);
  const raw = (settings?.inventory as { lowStockThreshold?: unknown } | null)
    ?.lowStockThreshold;
  const threshold =
    typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : 2;
  const [stock, stale] = await Promise.all([
    db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM "StockItem" s JOIN "Variant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId" WHERE v."isActive"=true AND p.status='ACTIVE' AND p."deletedAt" IS NULL AND s."onHand"-s.reserved <= COALESCE(s."lowStockThreshold", ${threshold})`,
    Promise.all(
      markets.map(async (market) => {
        const rate = await getActiveRate(market).catch(() => null);
        return isRateStale(rate?.at, market.fxStaleHours, now)
          ? market.code
          : null;
      }),
    ),
  ]);
  await persistOperationalAlerts(
    operationalAlerts(
      {
        lastBackupAt: last?.finishedAt ?? null,
        offsiteOk: offsiteHealthy(last, now),
        lowStock: Number(stock[0]?.count ?? 0n),
        overdueUnpaid,
        failedJobs,
        staleMarkets: stale.filter(
          (code): code is NonNullable<typeof code> => code !== null,
        ),
      },
      now,
    ),
    now,
  );
}
