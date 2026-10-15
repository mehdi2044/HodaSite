import { getTranslations } from "next-intl/server";
import { fittingDiagnostics } from "@/modules/fitting/health";
export async function FittingHealth({ actorId }: { actorId: string }) {
  const t = await getTranslations("fittingHealth");
  const value = await fittingDiagnostics(actorId);
  const presence = (ok: boolean) => (ok ? t("present") : t("absent"));
  return (
    <section className="card grid gap-4" data-testid="fitting-health">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p>{t("readOnly")}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          [t("enabled"), value.enabled ? t("on") : t("off")],
          [t("config"), value.configValid ? t("valid") : t("invalid")],
          [t("credential"), presence(value.credentialPresent)],
          [t("cron"), presence(value.cronSecretPresent)],
          [t("models"), `${value.readyModels} / ${value.models}`],
          [
            t("storage"),
            `${value.storage} · ${presence(value.storageConfigurationPresent)}`,
          ],
          [t("lastJob"), value.lastCompletedJobAt ?? t("unverified")],
          [t("heartbeat"), t("unverified")],
          [t("provider"), t("unverified")],
          [t("storageConnection"), t("unverified")],
          [t("oldestQueued"), value.oldestQueuedAt ?? t("none")],
          [t("oldestRunning"), value.oldestRunningAt ?? t("none")],
        ].map(([label, text]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="break-words">
              <bdi>{text}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <p>{t("heartbeatNote")}</p>
      <p
        role="status"
        className={
          value.delayedQueued || value.delayedRunning ? "text-error" : ""
        }
      >
        {t("delay", {
          queued: value.delayedQueued,
          running: value.delayedRunning,
        })}
      </p>
      <h3 className="font-semibold">{t("sessions")}</h3>
      <dl className="flex flex-wrap gap-4">
        {Object.entries(value.sessions24h).map(([status, count]) => (
          <div key={status}>
            <dt>{t(`statuses.${status}`)}</dt>
            <dd>
              <bdi>{count}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <h3 className="font-semibold">{t("jobs")}</h3>
      <dl className="flex flex-wrap gap-4">
        {Object.entries(value.jobs).map(([status, count]) => (
          <div key={status}>
            <dt>{t(`statuses.${status}`)}</dt>
            <dd>
              <bdi>{count}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <p>{t("refunds", { count: value.refunds24h })}</p>
      <p>{t("refundNote")}</p>
      <h3 className="font-semibold">{t("errors")}</h3>
      {Object.keys(value.errors24h).length ? (
        <ul>
          {Object.entries(value.errors24h).map(([code, count]) => (
            <li key={code}>
              <bdi>{code}</bdi> · <bdi>{count}</bdi>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("none")}</p>
      )}
      <p className="text-sm text-muted">{t("causeNote")}</p>
      <time dateTime={value.observedAt}>
        <bdi>{value.observedAt}</bdi>
      </time>
    </section>
  );
}
