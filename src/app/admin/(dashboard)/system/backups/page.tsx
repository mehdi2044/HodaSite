import { access } from "node:fs/promises";
import path from "node:path";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/modules/auth/page";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { assertBackupOwner, downloadLink } from "@/modules/backups/service";
import { backupKey, UPLOAD_FAILURE_CODES } from "@/modules/backups/validation";
import {
  BackupButton,
  BackupSettingsForm,
  RefreshBackups,
  RestoreControl,
  UploadBackup,
} from "./controls";
export const dynamic = "force-dynamic";
export default async function BackupsPage() {
  const userId = await requireAdminPage("backup.view");
  const t = await getTranslations("backups");
  const owner = await assertBackupOwner(userId)
    .then(() => true)
    .catch(() => false);
  const create = await can(userId, "backup.create");
  const upload = owner && (await can(userId, "backup.upload"));
  const [backups, tasks, uploaded, settings] = await Promise.all([
    db.backup.findMany({
      where: { localPrunedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.opsTask.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    upload
      ? db.backupUpload.findMany({
          where: { ownerId: userId, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    db.backupSettings.findUnique({ where: { id: "default" } }),
  ]);
  const ready = new Set<string>();
  for (const b of backups)
    if (
      backupKey.safeParse(b.fileKey).success &&
      (await access(
        path.join(
          process.env.BACKUP_ROOT ?? "/backups",
          "exports",
          `${b.fileKey}.zip`,
        ),
      )
        .then(() => true)
        .catch(() => false))
    )
      ready.add(b.id);
  const status = (value: string) => (t.has(value) ? t(value) : value);
  return (
    <div className="grid gap-5 min-w-0">
      <RefreshBackups />
      <h1>{t("title")}</h1>
      <p className="text-muted">{t("description")}</p>
      {create && <BackupButton type="BACKUP" />}
      <section className="grid gap-3">
        {backups.length ? (
          backups.map((b) => (
            <article className="card min-w-0" key={b.id}>
              <h2 className="break-all" dir="ltr">
                {b.fileKey}
              </h2>
              <p>
                {status(b.status)} ·{" "}
                {(Number(b.sizeBytes) / 1048576).toFixed(1)} MiB
              </p>
              <p
                className={
                  b.offsiteStatus === "OK" ? "text-success" : "text-error"
                }
              >
                {t("offsite")}: {status(b.offsiteStatus)}
              </p>
              <p>
                {t("verified")}: {b.verifiedAt?.toISOString() ?? t("none")}
              </p>
              {b.status === "DONE" && (
                <div className="flex flex-wrap gap-3 mt-3">
                  {ready.has(b.id) ? (
                    <a
                      className="button min-h-11"
                      href={downloadLink(userId, b.fileKey)}
                    >
                      {t("download")}
                    </a>
                  ) : (
                    <BackupButton type="EXPORT" backupId={b.id} />
                  )}
                  <BackupButton type="VERIFY" backupId={b.id} />
                </div>
              )}
              {owner && b.status === "DONE" && (
                <RestoreControl backupId={b.id} />
              )}
            </article>
          ))
        ) : (
          <p>{t("none")}</p>
        )}
      </section>
      {upload && (
        <section className="card grid gap-3">
          <UploadBackup />
          {uploaded.map((u) => (
            <article key={u.id} className="border-t pt-3">
              <p className="break-all">
                {u.originalName} · {status(u.status)}
              </p>
              {u.error && (
                <p className="text-error">
                  {t(
                    UPLOAD_FAILURE_CODES.find((code) => code === u.error) ??
                      "VALIDATION_FAILED",
                  )}
                </p>
              )}
              {u.status === "READY" && <RestoreControl uploadId={u.id} />}
            </article>
          ))}
        </section>
      )}
      <section className="card grid gap-3">
        <h2>{t("operations")}</h2>
        {tasks.map((task) => (
          <p key={task.id}>
            <bdi>{task.createdAt.toISOString()}</bdi> · {status(task.type)} ·{" "}
            {status(task.status)} · {status(task.log)}
          </p>
        ))}
      </section>
      {owner && create && (
        <section className="card">
          <h2>{t("settings")}</h2>
          <BackupSettingsForm
            settings={
              settings ?? {
                enabled: false,
                hourUtc: 3,
                minuteUtc: 30,
                includeMedia: true,
                keepDaily: 7,
                keepWeekly: 4,
                keepMonthly: 6,
                verifyWeekday: 0,
              }
            }
          />
        </section>
      )}
    </div>
  );
}
