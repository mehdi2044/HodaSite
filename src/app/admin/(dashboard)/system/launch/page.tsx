import { getLocale, getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/modules/auth/page";
import { getLaunchReadiness } from "@/modules/launch";

export const dynamic = "force-dynamic";
export default async function LaunchPage() {
  const userId = await requireAdminPage("system.health.view");
  const [t, locale, snapshot] = await Promise.all([
    getTranslations("launch"),
    getLocale(),
    getLaunchReadiness(userId),
  ]);
  const automatic = snapshot.checks.filter((c) => c.kind === "automatic");
  const count = (status: string) =>
    snapshot.checks.filter((c) => c.status === status).length;
  const date = (value: Date) =>
    new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value);
  return (
    <div className="grid min-w-0 gap-5" data-testid="launch-page">
      <header className="grid gap-2">
        <h1>{t("title")}</h1>
        <p className="text-muted">{t("description")}</p>
      </header>
      <section className="card grid gap-3" aria-labelledby="launch-summary">
        <h2 id="launch-summary">{t("notReady")}</h2>
        <p>
          {t("summary", {
            pass: count("pass"),
            blocked: count("blocked"),
            pending: count("pending"),
          })}
        </p>
        <p className="text-sm text-muted">{t("noPublication")}</p>
        <p className="text-sm">
          {t("checkedAt")}{" "}
          <time dateTime={snapshot.checkedAt.toISOString()}>
            {date(snapshot.checkedAt)}
          </time>{" "}
          <bdi>UTC</bdi>
        </p>
        <a href="/admin/system/launch" className="button min-h-11 w-fit">
          {t("refresh")}
        </a>
      </section>
      {(["automatic", "manual"] as const).map((kind) => (
        <section
          key={kind}
          className="grid gap-3"
          aria-labelledby={`launch-${kind}`}
        >
          <h2 id={`launch-${kind}`}>{t(kind)}</h2>
          <p className="text-sm text-muted">{t(`${kind}Hint`)}</p>
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            {(kind === "automatic"
              ? automatic
              : snapshot.checks.filter((c) => c.kind === "manual")
            ).map((check) => (
              <article
                key={check.id}
                className="card grid min-w-0 content-start gap-2"
                data-testid={`launch-${check.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 font-semibold">
                    {t(`${check.id}Title`)}
                  </h3>
                  <span
                    className={`rounded-full border border-current px-3 py-1 text-sm font-medium ${check.status === "pass" ? "text-success" : check.status === "blocked" ? "text-error" : "text-muted"}`}
                    data-status={check.status}
                  >
                    {t(check.status)}
                  </span>
                </div>
                <p className="text-sm text-muted">{t(`${check.id}Hint`)}</p>
                {check.at && (
                  <time className="text-sm" dateTime={check.at.toISOString()}>
                    {date(check.at)} <bdi>UTC</bdi>
                  </time>
                )}
                {Boolean(check.markets?.length) && (
                  <p className="text-sm">
                    {t("affectedMarkets")}{" "}
                    <bdi>{check.markets?.join(" / ")}</bdi>
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
