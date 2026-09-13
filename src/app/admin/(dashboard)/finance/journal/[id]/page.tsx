import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { journalDetail } from "@/modules/finance/ledger-admin";
import { JournalLines } from "@/components/finance/journal-lines";
import { ReversalForm } from "@/components/finance/journal-form";
import { Iso } from "@/components/storefront/iso";
export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("journal"),
    locale = await getLocale();
  let data: Awaited<ReturnType<typeof journalDetail>>;
  try {
    data = await journalDetail((await params).id);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  const { entry, accounts, market } = data;
  const date = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(at);
  const lines = entry.lines.map((line) => ({
    accountId: line.accountId,
    currency: line.currency,
    debit: line.debit.toFixed(4),
    credit: line.credit.toFixed(4),
    debitTry: line.debitTry.toFixed(4),
    creditTry: line.creditTry.toFixed(4),
    debitUsd: line.debitUsd.toFixed(4),
    creditUsd: line.creditUsd.toFixed(4),
    rateTry: line.rateTry.toFixed(12),
    rateUsd: line.rateUsd.toFixed(12),
  }));
  return (
    <section className="finance-page" data-testid="journal-detail">
      <Link className="journal-text-button" href="/admin/finance/journal">
        {t("back")}
      </Link>
      <div className="finance-heading">
        <h1>{t("detail")}</h1>
        <p>
          {entry.reversalOfId
            ? t("reversal")
            : entry.reversal
              ? t("hasReversal")
              : t("posted")}
        </p>
      </div>
      <article className="journal-line">
        <h2>{entry.memo}</h2>
        <p className="journal-id">
          <Iso>{entry.id}</Iso>
        </p>
        <dl className="journal-meta">
          <div>
            <dt>{t("market")}</dt>
            <dd>
              <Iso>{market.code}</Iso>
            </dd>
          </div>
          <div>
            <dt>{t("effectiveAt")}</dt>
            <dd>{date(entry.effectiveAt)}</dd>
          </div>
          <div>
            <dt>{t("fxAsOf")}</dt>
            <dd>{date(entry.fxAsOf)}</dd>
          </div>
          <div>
            <dt>{t("createdAt")}</dt>
            <dd>{date(entry.createdAt)}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted">{t("dateHelp")}</p>
      </article>
      <p className="text-muted">{t("immutable")}</p>
      {entry.reversalOfId && (
        <Link
          className="button"
          href={`/admin/finance/journal/${entry.reversalOfId}`}
        >
          {t("originalEntry")}
        </Link>
      )}
      {entry.reversal && (
        <Link
          className="button"
          href={`/admin/finance/journal/${entry.reversal.id}`}
        >
          {t("reversalEntry")}
        </Link>
      )}
      <JournalLines lines={lines} accounts={accounts} />
      {data.canReverse && (
        <ReversalForm
          entryId={entry.id}
          requestKey={randomUUID()}
          today={new Date().toISOString().slice(0, 16)}
          minimum={new Date(
            Math.ceil(entry.effectiveAt.getTime() / 60000) * 60000,
          )
            .toISOString()
            .slice(0, 16)}
        />
      )}
    </section>
  );
}
