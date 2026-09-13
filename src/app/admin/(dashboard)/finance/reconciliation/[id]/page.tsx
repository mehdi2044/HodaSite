import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { reconciliationDetail } from "@/modules/finance/reconciliation-service";
import { displayReportAmount } from "@/modules/finance";
import { Iso } from "@/components/storefront/iso";
export default async function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("reconciliation"),
    locale = await getLocale();
  let data: Awaited<ReturnType<typeof reconciliationDetail>>;
  try {
    data = await reconciliationDetail((await params).id);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  const money = (amount: string, currency = data.currency) => (
    <Iso>
      {displayReportAmount(amount, locale)} {currency}
    </Iso>
  );
  const date = (at: string | Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(at));
  const totals = data.review.totals,
    fx = data.review.fx;
  const metrics = [
    "items",
    "chargedFees",
    "absorbedFees",
    "netGoods",
    "expected",
    "approved",
    "external",
    "credit",
    "other",
    "difference",
  ] as const;
  return (
    <section className="finance-page" data-testid="reconciliation-detail">
      <Link
        className="journal-text-button"
        href="/admin/finance/reconciliation"
      >
        {t("back")}
      </Link>
      <h1>
        {t("detail")} · <Iso>{data.number}</Iso>
      </h1>
      <p>
        <Iso>
          {data.marketCode} · {data.currency}
        </Iso>{" "}
        · {t(data.kind === "EXCHANGE" ? "exchange" : "sale")}
      </p>
      <p className="text-muted">{t("intro")}</p>
      <article className="journal-line">
        <h2>{t(data.review.issues.length ? "needsReview" : "matched")}</h2>
        {data.review.issues.length ? (
          <ul className="reconciliation-issues">
            {data.review.issues.map((issue) => (
              <li key={issue} data-issue={issue}>
                {t(`issues.${issue}`)}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("matchedHelp")}</p>
        )}
      </article>
      <dl className="finance-metrics">
        <div>
          <dt>{t("total")}</dt>
          <dd>{money(data.total)}</dd>
        </div>
        <div>
          <dt>{t("discount")}</dt>
          <dd>{money(data.discount)}</dd>
        </div>
        <div>
          <dt>{t("paidAt")}</dt>
          <dd>{data.paidAt ? date(data.paidAt) : t("undated")}</dd>
        </div>
      </dl>
      {totals && (
        <article className="finance-market">
          <h2>{t("amounts")}</h2>
          <p className="text-muted">{t("amountsHelp")}</p>
          <dl className="finance-metrics">
            {metrics.map((key) => (
              <div key={key} data-metric={key}>
                <dt>{t(key)}</dt>
                <dd>{money(totals[key])}</dd>
              </div>
            ))}
          </dl>
        </article>
      )}
      <article className="finance-market">
        <h2>{t("fx")}</h2>
        <p className="text-muted">{t("fxHelp")}</p>
        <dl className="finance-metrics">
          <div>
            <dt>{t("savedTry")}</dt>
            <dd>{money(data.totalTry, "TRY")}</dd>
          </div>
          <div>
            <dt>{t("savedUsd")}</dt>
            <dd>{money(data.totalUsd, "USD")}</dd>
          </div>
          {fx && (
            <>
              <div>
                <dt>{t("expectedTry")}</dt>
                <dd>{money(fx.expectedTry, "TRY")}</dd>
              </div>
              <div>
                <dt>{t("expectedUsd")}</dt>
                <dd>{money(fx.expectedUsd, "USD")}</dd>
              </div>
            </>
          )}
        </dl>
        {fx && (
          <details className="finance-definitions">
            <summary>{t("rates")}</summary>
            <dl className="journal-meta">
              <div>
                <dt>{t("quotedAt")}</dt>
                <dd>{date(fx.quotedAt)}</dd>
              </div>
              {(
                [
                  "marketPerUsd",
                  "tryPerUsd",
                  "ledgerRateTry",
                  "ledgerRateUsd",
                ] as const
              ).map((key) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd>
                    <Iso>{fx[key]}</Iso>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </article>
      <h2>{t("payments")}</h2>
      <p className="text-muted">{t("paymentsHelp")}</p>
      <div className="journal-list">
        {data.payments.map((p) => (
          <article className="journal-line" key={p.id}>
            <h3>
              {t(
                ["CASH", "OFFLINE_BANK_TRANSFER", "STORE_CREDIT"].includes(
                  p.method,
                )
                  ? `methods.${p.method}`
                  : "methods.OTHER",
              )}
            </h3>
            <p>{money(p.amount, p.currency)}</p>
            <p>{t(`statuses.${p.status}`)}</p>
            <p>
              {t("reviewedAt")}:{" "}
              {p.reviewedAt ? date(p.reviewedAt) : t("undated")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
