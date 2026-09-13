import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { journalList } from "@/modules/finance/ledger-admin";
import { FinanceFilters } from "@/components/finance/filters";
import { Iso } from "@/components/storefront/iso";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("journal"),
    locale = await getLocale(),
    query = await searchParams;
  let data: Awaited<ReturnType<typeof journalList>>;
  try {
    data = await journalList({
      from: query.from,
      to: query.to,
      marketId: query.marketId,
      cursor: query.cursor,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    if (error instanceof ForbiddenError) notFound();
    if (
      error instanceof ZodError ||
      (error instanceof Error &&
        ["INVALID_REPORT_PERIOD", "INVALID_JOURNAL_CURSOR"].includes(
          error.message,
        ))
    )
      return (
        <section className="finance-page">
          <h1>{t("title")}</h1>
          <p role="alert">{t("invalidFilter")}</p>
          <Link className="button" href="/admin/finance/journal">
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
    <section className="finance-page" data-testid="journal-list">
      <div className="finance-heading">
        <div>
          <p className="text-muted">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
        </div>
        {data.canPost && (
          <Link className="button" href="/admin/finance/journal/new">
            {t("new")}
          </Link>
        )}
      </div>
      <p className="text-muted">{t("intro")}</p>
      <FinanceFilters
        key={filterQuery.toString()}
        from={data.filter.from}
        to={data.filter.to}
        marketId={data.filter.marketId}
        markets={data.markets}
        actionPath="/admin/finance/journal"
      />
      <p className="text-sm text-muted">{t("listHelp")}</p>
      {!data.rows.length && (
        <div className="finance-empty">
          <h2>{t("empty")}</h2>
          <p>{t("emptyHelp")}</p>
        </div>
      )}
      <div className="journal-list">
        {data.rows.map((entry) => (
          <article className="journal-line" key={entry.id}>
            <p className="text-muted">
              <Iso>
                {data.markets.find((m) => m.id === entry.marketId)?.code}
              </Iso>{" "}
              ·{" "}
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(entry.effectiveAt)}
            </p>
            <h2>
              <Link href={`/admin/finance/journal/${entry.id}`}>
                {entry.memo}
              </Link>
            </h2>
            <p>
              {entry.reversalOfId
                ? t("reversal")
                : entry.reversal
                  ? t("hasReversal")
                  : t("posted")}{" "}
              · {t("lineCount", { count: entry._count.lines })}
            </p>
            <p className="journal-id">
              <Iso>{entry.id}</Iso>
            </p>
          </article>
        ))}
      </div>
      {data.next && (
        <Link
          className="button"
          href={`/admin/finance/journal?${filterQuery}&cursor=${encodeURIComponent(data.next)}`}
        >
          {t("older")}
        </Link>
      )}
      <Link className="journal-text-button" href="/admin/finance">
        {t("reports")}
      </Link>
    </section>
  );
}
