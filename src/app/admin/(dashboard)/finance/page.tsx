import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { auth } from "@/modules/auth";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import {
  financeReport,
  visibleFinanceMarkets,
  reportFilter,
  displayReportAmount,
} from "@/modules/finance";
import { FinanceFilters } from "@/components/finance/filters";
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams,
    t = await getTranslations("finance"),
    locale = await getLocale();
  const raw = { from: query.from, to: query.to, marketId: query.marketId };
  let report: Awaited<ReturnType<typeof financeReport>> | undefined,
    invalid = false;
  try {
    report = await financeReport(raw);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    if (error instanceof ForbiddenError) notFound();
    if (
      error instanceof ZodError ||
      (error instanceof Error && error.message === "INVALID_REPORT_PERIOD")
    )
      invalid = true;
    else throw error;
  }
  const markets =
    report?.markets ??
    (await visibleFinanceMarkets((await auth())?.user?.id ?? ""));
  const filter = report?.filter ?? reportFilter({});
  const metrics = [
    "paidOrders",
    "externalPayments",
    "creditPayments",
    "externalRefunds",
    "creditRefunds",
    "netExternal",
  ] as const;
  const columns = [
    "day",
    "paidOrders",
    "externalPayments",
    "creditPayments",
    "externalRefunds",
    "creditRefunds",
    "netExternal",
  ] as const;
  const exportQuery = new URLSearchParams({
    from: filter.from,
    to: filter.to,
    ...(filter.marketId ? { marketId: filter.marketId } : {}),
  });
  return (
    <section
      className="finance-page"
      data-testid="finance-report"
      aria-labelledby="finance-title"
    >
      <div className="finance-heading">
        <div>
          <p className="text-muted">{t("eyebrow")}</p>
          <h1 id="finance-title">{t("title")}</h1>
        </div>
        {report && (
          <a className="button" href={`/admin/finance/export?${exportQuery}`}>
            {t("export")}
          </a>
        )}
      </div>
      <p className="text-muted">{t("intro")}</p>
      <FinanceFilters
        key={exportQuery.toString()}
        from={filter.from}
        to={filter.to}
        marketId={filter.marketId}
        markets={markets}
      />
      <p className="text-sm text-muted">{t("periodHelp")}</p>
      {invalid && (
        <p role="alert" className="finance-notice">
          {t("invalid")}
        </p>
      )}
      {report?.rows.length === 0 && (
        <div className="finance-empty">
          <h2>{t("empty")}</h2>
          <p>{t("emptyHelp")}</p>
        </div>
      )}
      {report?.rows.map((row) => (
        <article
          key={`${row.marketId}:${row.currency}`}
          data-market={row.marketId}
          className="finance-market"
        >
          <div className="finance-heading">
            <h2>
              <bdi dir="ltr">
                {markets.find((m) => m.id === row.marketId)?.code} ·{" "}
                {row.currency}
              </bdi>
            </h2>
            <p>
              {t("orderCount")}: <bdi dir="ltr">{row.totals.orderCount}</bdi>
            </p>
          </div>
          {row.totals.undated !== "0" && (
            <p role="status" className="finance-notice">
              {t("undatedHelp")} <bdi dir="ltr">{row.totals.undated}</bdi>
            </p>
          )}
          <dl className="finance-metrics">
            {metrics.map((key) => (
              <div
                key={key}
                data-metric={key}
                className={key === "netExternal" ? "finance-net" : ""}
              >
                <dt>{t(key)}</dt>
                <dd>
                  <bdi dir="ltr">
                    {displayReportAmount(row.totals[key], locale)}
                  </bdi>
                  <span>{row.currency}</span>
                </dd>
              </div>
            ))}
          </dl>
          {row.days.length > 0 && (
            <details className="finance-daily">
              <summary>{t("daily")}</summary>
              <div
                className="finance-table"
                tabIndex={0}
                role="region"
                aria-label={t("daily")}
              >
                <table>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c} scope="col">
                          {t(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {row.days.map((d) => (
                      <tr key={d.day}>
                        {columns.map((c) => (
                          <td key={c}>
                            <bdi dir="ltr">
                              {c === "day"
                                ? new Intl.DateTimeFormat(locale, {
                                    dateStyle: "medium",
                                    timeZone: "UTC",
                                  }).format(new Date(`${d.day}T00:00:00Z`))
                                : displayReportAmount(d.totals[c], locale)}
                            </bdi>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </article>
      ))}
      <details className="finance-definitions">
        <summary>{t("definitions")}</summary>
        <p>{t("basis")}</p>
        <p>{t("notProfit")}</p>
      </details>
    </section>
  );
}
