/** Readiness signals only. Configuration and CI are not release acceptance. */
export type LaunchCheck = {
  id: string;
  status: "pass" | "blocked" | "pending";
  kind: "automatic" | "manual";
  at?: Date | null;
  markets?: string[];
};
export type BackupEvidence = {
  status: string;
  mediaIncluded: boolean;
  finishedAt: Date | null;
  offsiteStatus: string;
  offsiteSyncedAt: Date | null;
};
export type LaunchSnapshot = {
  backup: BackupEvidence | null;
  verification: {
    status: string;
    mediaIncluded: boolean;
    verifiedAt: Date | null;
    ok: boolean;
  } | null;
  emailConfigured: boolean;
  offsiteConfigured: boolean;
  privilegedUsers: number;
  missingMfa: number;
  maintenanceOff: boolean;
  markets: { code: string; fresh: boolean }[];
  backupTask?: OperationEvidence | null;
  verifyTask?: OperationEvidence | null;
  noopProviders: number;
};
export type OperationEvidence = {
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};
export const MANUAL_GATES = [
  "https",
  "cp1",
  "cp2",
  "restoreDrill",
  "emailIR",
  "emailTR",
  "emailCA",
  "accessIR",
  "accessTR",
  "accessCA",
  "pwaDevices",
  "paymentShipping",
  "commercialSettings",
  "performance",
] as const;
const HOUR = 60 * 60 * 1000;
export function withinAge(
  at: Date | null | undefined,
  hours: number,
  now: Date,
) {
  if (!at || !Number.isFinite(at.getTime())) return false;
  const elapsed = now.getTime() - at.getTime();
  return elapsed >= 0 && elapsed <= hours * HOUR;
}
function newerUnsuccessful(
  task: OperationEvidence | null | undefined,
  at: Date | null | undefined,
) {
  return Boolean(
    task &&
    task.status !== "DONE" &&
    (!at || (task.finishedAt ?? task.startedAt ?? task.createdAt) >= at),
  );
}
export function launchChecks(
  snapshot: LaunchSnapshot,
  now = new Date(),
): LaunchCheck[] {
  const b = snapshot.backup;
  const fullBackup =
    b?.status === "DONE" &&
    b.mediaIncluded &&
    !newerUnsuccessful(snapshot.backupTask, b.finishedAt);
  const verification = snapshot.verification;
  const automatic = (
    id: string,
    pass: boolean,
    at?: Date | null,
  ): LaunchCheck => ({
    id,
    kind: "automatic",
    status: pass ? "pass" : "blocked",
    at,
  });
  return [
    automatic(
      "backup",
      Boolean(fullBackup && withinAge(b?.finishedAt, 36, now)),
      b?.finishedAt,
    ),
    automatic(
      "offsite",
      Boolean(
        snapshot.offsiteConfigured &&
        fullBackup &&
        withinAge(b?.finishedAt, 36, now) &&
        b?.offsiteStatus === "OK" &&
        withinAge(b?.offsiteSyncedAt, 36, now) &&
        b?.finishedAt &&
        b.offsiteSyncedAt &&
        b.offsiteSyncedAt >= b.finishedAt,
      ),
      b?.offsiteSyncedAt,
    ),
    automatic(
      "verify",
      Boolean(
        verification?.status === "DONE" &&
        verification.mediaIncluded &&
        verification.ok &&
        withinAge(verification.verifiedAt, 7 * 24, now) &&
        !newerUnsuccessful(snapshot.verifyTask, verification.verifiedAt),
      ),
      verification?.verifiedAt,
    ),
    automatic("emailConfig", snapshot.emailConfigured),
    automatic("providers", snapshot.noopProviders === 0),
    {
      ...automatic(
        "fx",
        snapshot.markets.length > 0 && snapshot.markets.every((m) => m.fresh),
      ),
      markets: snapshot.markets.filter((m) => !m.fresh).map((m) => m.code),
    },
    automatic("mfa", snapshot.privilegedUsers > 0 && snapshot.missingMfa === 0),
    automatic("maintenance", snapshot.maintenanceOff),
    ...MANUAL_GATES.map((id): LaunchCheck => ({
      id,
      status: "pending",
      kind: "manual",
    })),
  ];
}

/** Returns booleans only; secret values and infrastructure addresses never leave this function. */
export function configuredServices(env: Record<string, string | undefined>) {
  const present = (key: string) => Boolean(env[key]?.trim());
  const emailConfigured =
    present("EMAIL_FROM") &&
    ((env.EMAIL_PROVIDER === "smtp" && present("SMTP_HOST")) ||
      (env.EMAIL_PROVIDER === "resend" && present("RESEND_API_KEY")));
  return {
    emailConfigured,
    offsiteConfigured: [
      "BACKUP_OFFSITE_ENDPOINT",
      "BACKUP_OFFSITE_KEY",
      "BACKUP_OFFSITE_SECRET",
      "BACKUP_OFFSITE_BUCKET",
    ].every(present),
  };
}
