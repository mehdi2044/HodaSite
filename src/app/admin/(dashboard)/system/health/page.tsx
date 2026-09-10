import { getActiveRate } from "@/modules/pricing";
import { statfs } from "node:fs/promises";
import { requireAdminPage } from "@/modules/auth/page";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
export const dynamic = "force-dynamic";
function bytes(value: bigint | number) {
  return `${(Number(value) / 1048576).toFixed(1)} MiB`;
}
export default async function Health() {
  await requireAdminPage("system.health.view");
  const t = await getTranslations("healthAdmin");
  const [size, media, last, alerts, queued, failed, fx, migration, space] =
    await Promise.all([
      db.$queryRaw<
        { bytes: bigint }[]
      >`SELECT pg_database_size(current_database()) AS bytes`,
      db.media.aggregate({ _sum: { bytes: true } }),
      db.backup.findFirst({
        where: { status: "DONE" },
        orderBy: { finishedAt: "desc" },
      }),
      db.systemAlert.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.job.count({ where: { status: "PENDING" } }),
      db.job.count({ where: { status: "FAILED" } }),
      db.market.findMany({ select: { id: true, code: true } }),
      db.$queryRaw<
        { migration_name: string; finished_at: Date }[]
      >`SELECT migration_name,finished_at FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1`,
      statfs(process.env.MEDIA_DIR ?? "/tmp").catch(() => null),
    ]);
  const rates = await Promise.all(
    fx.map(async (market) => ({
      code: market.code,
      rate: await getActiveRate(market).catch(() => null),
    })),
  );
  const provider = process.env.EMAIL_PROVIDER ?? "noop";
  const emailConfigured =
    provider === "smtp"
      ? Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM)
      : provider === "resend"
        ? Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
        : false;
  return (
    <div className="grid gap-5">
      <h1>{t("title")}</h1>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          [t("database"), bytes(size[0]?.bytes ?? 0n)],
          [t("media"), bytes(media._sum.bytes ?? 0)],
          [t("disk"), space ? bytes(space.bavail * space.bsize) : t("unknown")],
          [t("storage"), process.env.STORAGE_PROVIDER ?? "local"],
          [t("queued"), String(queued)],
          [t("failed"), String(failed)],
          [
            t("email"),
            `${provider} · ${emailConfigured ? t("configured") : t("notConfigured")}`,
          ],
          [t("backup"), last?.finishedAt?.toLocaleString("fa") ?? t("none")],
          [t("verified"), last?.verifiedAt?.toLocaleString("fa") ?? t("none")],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <h2 className="text-sm text-muted">{label}</h2>
            <p className="mt-3 text-xl">
              <bdi>{value}</bdi>
            </p>
          </div>
        ))}
      </section>
      <p className="text-sm text-muted">{t("configurationOnly")}</p>
      <section className="card">
        <h2>{t("offsite")}</h2>
        <p
          className={
            last?.offsiteStatus === "OK" ? "text-success" : "text-error"
          }
        >
          {last?.offsiteStatus === "OK" ? t("ok") : t("offsiteMissing")}
        </p>
      </section>
      <section className="card grid gap-3">
        <h2>{t("fx")}</h2>
        {rates.map((m) => (
          <p key={m.code}>
            <bdi>{m.code}</bdi> ·{" "}
            {m.rate?.at?.toLocaleString("fa") ?? t("none")}
          </p>
        ))}
      </section>
      <section className="card">
        <h2>{t("migration")}</h2>
        <p className="break-all" dir="ltr">
          {migration[0]?.migration_name ?? t("none")}
        </p>
        <p dir="ltr">{process.env.APP_VERSION ?? "development"}</p>
      </section>
      <section className="card grid gap-3">
        <h2>{t("alerts")}</h2>
        {alerts.length ? (
          alerts.map((a) => (
            <div key={a.id} className="border-t border-black/10 pt-3">
              <bdi>{a.code}</bdi> · <bdi>{a.severity}</bdi>
              <p>{a.message}</p>
              <time className="text-sm text-muted">
                {a.createdAt.toLocaleString("fa")}
              </time>
            </div>
          ))
        ) : (
          <p>{t("noAlerts")}</p>
        )}
      </section>
    </div>
  );
}
