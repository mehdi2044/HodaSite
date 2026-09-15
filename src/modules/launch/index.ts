import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { requiresMfa } from "@/modules/auth";
import { getActiveRate } from "@/modules/pricing";
import { isMaintenanceEffective, isMaintenanceOn } from "@/modules/settings";
import { configuredServices, launchChecks, withinAge } from "./checks";
export { MANUAL_GATES, launchChecks, configuredServices } from "./checks";
export type { LaunchCheck, LaunchSnapshot } from "./checks";

const maintenanceSchema = z.object({
  state: z.enum(["off", "on", "scheduled"]),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
});

export async function getLaunchReadiness(userId: string, now = new Date()) {
  await assertCan(userId, "system.health.view");
  const taskSelect = {
    status: true,
    createdAt: true,
    startedAt: true,
    finishedAt: true,
  } as const;
  const [
    backup,
    verification,
    users,
    markets,
    settings,
    maintenanceOn,
    backupTask,
    verifyTask,
    integrations,
  ] = await Promise.all([
    db.backup.findFirst({
      // Do not hide a newer failed/running attempt behind an older green backup.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        status: true,
        mediaIncluded: true,
        finishedAt: true,
        offsiteStatus: true,
        offsiteSyncedAt: true,
      },
    }),
    db.backup.findFirst({
      // The latest result must win even if it failed.
      where: { verifiedAt: { not: null } },
      orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
      select: {
        status: true,
        mediaIncluded: true,
        verifiedAt: true,
        verifyResult: true,
      },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: {
        mfaEnabled: true,
        mfaSecret: true,
        roles: {
          select: {
            role: {
              select: {
                key: true,
                permissions: { select: { permission: true } },
              },
            },
          },
        },
        overrides: { select: { permission: true, allow: true } },
      },
    }),
    db.market.findMany({
      where: { isActive: true },
      select: { id: true, code: true, fxStaleHours: true },
    }),
    db.siteSettings.findUnique({
      where: { id: "default" },
      select: { maintenance: true },
    }),
    isMaintenanceOn(),
    db.opsTask.findFirst({
      where: { type: "BACKUP" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: taskSelect,
    }),
    db.opsTask.findFirst({
      where: { type: "VERIFY" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: taskSelect,
    }),
    db.integration.findMany({
      where: { isActive: true },
      select: { provider: true },
    }),
  ]);
  const privileged = users.filter(requiresMfa);
  const maintenance = maintenanceSchema.safeParse(settings?.maintenance);
  const rates = await Promise.all(
    markets.map(async (market) => {
      const rate = await getActiveRate(market, now).catch(() => null);
      return {
        code: market.code,
        fresh: withinAge(rate?.at, market.fxStaleHours, now),
      };
    }),
  );
  const ok = z
    .object({ ok: z.literal(true) })
    .safeParse(verification?.verifyResult).success;
  return {
    checkedAt: now,
    checks: launchChecks(
      {
        backup,
        backupTask,
        verifyTask,
        verification: verification ? { ...verification, ok } : null,
        ...configuredServices(process.env),
        noopProviders: integrations.filter(
          (i) =>
            !i.provider.trim() || i.provider.trim().toLowerCase() === "noop",
        ).length,
        privilegedUsers: privileged.length,
        missingMfa: privileged.filter((u) => !u.mfaEnabled || !u.mfaSecret)
          .length,
        maintenanceOff:
          !maintenanceOn &&
          maintenance.success &&
          !isMaintenanceEffective(maintenance.data, now),
        markets: rates,
      },
      now,
    ),
  };
}
