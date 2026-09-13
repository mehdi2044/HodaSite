import { useLocale, useTranslations } from "next-intl";
import { Iso } from "@/components/storefront/iso";
import { displayReportAmount } from "@/modules/finance/reports";
import {
  accountName,
  journalTotals,
  type DisplayLine,
} from "@/modules/finance/journal-display";

export function JournalLines({
  lines,
  accounts,
}: {
  lines: DisplayLine[];
  accounts: { id: string; code: string; nameI18n: unknown }[];
}) {
  const t = useTranslations("journal"),
    locale = useLocale();
  const amount = (value: string) => (
    <Iso>{displayReportAmount(value, locale)}</Iso>
  );
  return (
    <div className="journal-lines">
      <h2>{t("lines")}</h2>
      {lines.map((line, i) => {
        const account = accounts.find((a) => a.id === line.accountId);
        return (
          <article className="journal-line" key={i} data-testid="journal-line">
            <h3>
              {account ? (
                accountName(account, locale)
              ) : (
                <Iso>{line.accountId}</Iso>
              )}{" "}
              · <Iso>{line.currency}</Iso>
            </h3>
            <dl className="journal-amounts">
              <div>
                <dt>{t("debit")}</dt>
                <dd>{amount(line.debit)}</dd>
              </div>
              <div>
                <dt>{t("credit")}</dt>
                <dd>{amount(line.credit)}</dd>
              </div>
              <div>
                <dt>
                  {t("debit")} · <Iso>TRY</Iso>
                </dt>
                <dd>{amount(line.debitTry)}</dd>
              </div>
              <div>
                <dt>
                  {t("credit")} · <Iso>TRY</Iso>
                </dt>
                <dd>{amount(line.creditTry)}</dd>
              </div>
              <div>
                <dt>
                  {t("debit")} · <Iso>USD</Iso>
                </dt>
                <dd>{amount(line.debitUsd)}</dd>
              </div>
              <div>
                <dt>
                  {t("credit")} · <Iso>USD</Iso>
                </dt>
                <dd>{amount(line.creditUsd)}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted">
              {t("rateTry")}: <Iso>{line.rateTry}</Iso>
              <br />
              {t("rateUsd")}: <Iso>{line.rateUsd}</Iso>
            </p>
          </article>
        );
      })}
      <section className="journal-totals" aria-label={t("totals")}>
        <h2>{t("totals")}</h2>
        {journalTotals(lines).map((total) => (
          <div key={`${total.kind}:${total.currency}`}>
            <h3>
              {t(total.kind)} · <Iso>{total.currency}</Iso>
            </h3>
            <dl className="journal-amounts">
              <div>
                <dt>{t("debit")}</dt>
                <dd>{amount(total.debit)}</dd>
              </div>
              <div>
                <dt>{t("credit")}</dt>
                <dd>{amount(total.credit)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}
