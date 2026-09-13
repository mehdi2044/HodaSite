import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { reconciliationList } from "@/modules/finance/reconciliation-service";
import { displayReportAmount } from "@/modules/finance";
import { FinanceFilters } from "@/components/finance/filters";
import { Iso } from "@/components/storefront/iso";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("reconciliation"),
    locale = await getLocale(),
    q = await searchParams;
  let data: Awaited<ReturnType<typeof reconciliationList>>;
  try {
    data = await reconciliationList({
      from: q.from,
      to: q.to,
      marketId: q.marketId,
      cursor: q.cursor,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    if (error instanceof ForbiddenError) notFound();
    if (
      error instanceof ZodError ||
      (error instanceof Error &&
        ["INVALID_REPORT_PERIOD", "INVALID_RECONCILIATION_CURSOR"].includes(
          error.message,
        ))
    )
      return (
        <section className="finance-page">
          <h1>{t("title")}</h1>
          <p role="alert">{t("invalidFilter")}</p>
          <Link className="button" href="/admin/finance/reconciliation">
            {t("reset")}
          </Link>
        </section>
      );
    throw error;
  }
  const filterQuery = new URLSearchParams({
    from: data.filter.from,
    to: data.filter.to,
    ...(data.filter.marketId ? { marketId: data.filter.marketId } : {}),
  });
  return (
    <section className="finance-page" data-testid="reconciliation-list">
      <Link className="journal-text-button" href="/admin/finance">
        {t("reports")}
      </Link>
      <h1>{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      <FinanceFilters
        key={filterQuery.toString()}
        from={data.filter.from}
        to={data.filter.to}
        marketId={data.filter.marketId}
        markets={data.markets}
        actionPath="/admin/finance/reconciliation"
      />
      <p className="text-sm text-muted">{t("listHelp")}</p>
      {!data.rows.length && (
        <div className="finance-empty">
          <h2>{t("empty")}</h2>
        </div>
      )}
      <div className="journal-list">
        {data.rows.map((row) => (
          <article className="journal-line" key={row.id} data-order={row.id}>
            <div className="finance-heading">
              <h2>
                <Link href={`/admin/finance/reconciliation/${row.id}`}>
                  <Iso>{row.number}</Iso>
                </Link>
              </h2>
              <strong>
                {t(row.review.issues.length ? "needsReview" : "matched")}
              </strong>
            </div>
            <p>
              <Iso>
                {data.markets.find((m) => m.id === row.marketId)?.code} ·{" "}
                {row.currency}
              </Iso>{" "}
              ·{" "}
              {row.paidAt &&
                new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(row.paidAt)}
            </p>
            <p>
              {t("total")}:{" "}
              <Iso>
                {displayReportAmount(row.total, locale)} {row.currency}
              </Iso>
            </p>
            {row.review.issues.length > 0 && (
              <p className="text-muted">
                {t("issueCount", { count: row.review.issues.length })}
              </p>
            )}
          </article>
        ))}
      </div>
      {data.next && (
        <Link
          className="button"
          href={`/admin/finance/reconciliation?${filterQuery}&cursor=${encodeURIComponent(data.next)}`}
        >
          {t("older")}
        </Link>
      )}
    </section>
  );
}
