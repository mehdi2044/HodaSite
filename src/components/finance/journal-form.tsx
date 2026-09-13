"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  postJournal,
  reviewJournal,
  reverseJournal,
} from "@/app/admin/(dashboard)/finance/journal/actions";
import {
  accountName,
  type DisplayLine,
} from "@/modules/finance/journal-display";
import { JournalLines } from "./journal-lines";

// A later permission/maintenance error cannot establish that an earlier request
// did not commit. Once uncertain, keep the reviewed payload locked until success.
function usePostingError() {
  const [error, setMessage] = useState("");
  const [locked, setLocked] = useState(false);
  function setError(code: string) {
    setMessage(code);
    if (code === "UNKNOWN" || code === "JOURNAL_REQUEST_CONFLICT")
      setLocked(true);
  }
  return { error, setError, locked };
}

type Options = {
  markets: { id: string; code: string }[];
  accounts: {
    id: string;
    marketId: string;
    currency: string;
    code: string;
    nameI18n: unknown;
  }[];
};
type DraftLine = {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
};
const currencies = ["TRY", "USD", "CAD", "IRT"] as const;
export function JournalForm({
  options,
  requestKey,
  today,
}: {
  options: Options;
  requestKey: string;
  today: string;
}) {
  const t = useTranslations("journal"),
    locale = useLocale();
  const [marketId, setMarket] = useState(options.markets[0].id),
    [currency, setCurrency] = useState("TRY");
  const [lines, setLines] = useState<DraftLine[]>([
    { key: "first", accountId: "", debit: "", credit: "" },
    { key: "second", accountId: "", debit: "", credit: "" },
  ]);
  const [preview, setPreview] = useState<{
    request: unknown;
    lines: DisplayLine[];
    summary: { memo: string; effectiveAt: string; fxAsOf: string };
  } | null>(null);
  const { error, setError, locked } = usePostingError();
  const [confirmed, setConfirmed] = useState(false),
    [entryId, setEntryId] = useState("");
  const [pending, start] = useTransition();
  const accounts = options.accounts.filter(
    (a) => a.marketId === marketId && a.currency === currency,
  );
  function clearAccounts() {
    setLines((old) => old.map((l) => ({ ...l, accountId: "" })));
  }
  function change(
    key: string,
    field: "accountId" | "debit" | "credit",
    value: string,
  ) {
    setLines((old) =>
      old.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
    );
  }
  return (
    <div data-testid="journal-form">
      {entryId ? (
        <div className="finance-empty" role="status">
          <h2>{t("posted")}</h2>
          <Link className="button" href={`/admin/finance/journal/${entryId}`}>
            {t("openEntry")}
          </Link>
        </div>
      ) : (
        <>
          <form
            className="journal-form"
            hidden={!!preview}
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const request = {
                requestKey,
                marketId,
                memo: String(fields.get("memo")),
                effectiveAt: `${fields.get("effectiveAt")}T00:00:00Z`,
                fxAsOf: `${fields.get("fxAsOf")}:00Z`,
                lines: lines.map(({ accountId, debit, credit }) => ({
                  accountId,
                  currency,
                  debit: debit || "0",
                  credit: credit || "0",
                  rateTry:
                    currency === "TRY" ? "1" : String(fields.get("rateTry")),
                  rateUsd:
                    currency === "USD" ? "1" : String(fields.get("rateUsd")),
                })),
              };
              setError("");
              start(async () => {
                try {
                  const result = await reviewJournal(request);
                  if (result.ok) {
                    setPreview({
                      request,
                      lines: result.value,
                      summary: request,
                    });
                    setConfirmed(false);
                  } else
                    setError(
                      result.code === "UNKNOWN" ? "REVIEW_FAILED" : result.code,
                    );
                } catch {
                  setError("REVIEW_FAILED");
                }
              });
            }}
          >
            <fieldset disabled={pending}>
              <div className="journal-fields">
                <label>
                  {t("market")}
                  <select
                    name="marketId"
                    className="input"
                    value={marketId}
                    onChange={(e) => {
                      setMarket(e.target.value);
                      clearAccounts();
                    }}
                  >
                    {options.markets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("currency")}
                  <select
                    name="currency"
                    className="input"
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      clearAccounts();
                    }}
                  >
                    {currencies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("effectiveAt")}
                  <input
                    className="input"
                    name="effectiveAt"
                    type="date"
                    dir="ltr"
                    required
                    defaultValue={today}
                  />
                </label>
                <label>
                  {t("fxAsOf")}
                  <input
                    className="input"
                    name="fxAsOf"
                    type="datetime-local"
                    dir="ltr"
                    required
                    defaultValue={`${today}T00:00`}
                  />
                </label>
              </div>
              <p className="text-sm text-muted">{t("dateHelp")}</p>
              <label>
                {t("memo")}
                <textarea
                  className="input"
                  name="memo"
                  required
                  maxLength={500}
                  rows={3}
                />
              </label>
              <div className="journal-fields" key={currency}>
                <label>
                  {t("rateTry")}
                  <input
                    className="input"
                    name="rateTry"
                    dir="ltr"
                    inputMode="decimal"
                    required
                    readOnly={currency === "TRY"}
                    defaultValue={currency === "TRY" ? "1" : ""}
                    pattern="[0-9]{1,18}(\.[0-9]{1,12})?"
                  />
                </label>
                <label>
                  {t("rateUsd")}
                  <input
                    className="input"
                    name="rateUsd"
                    dir="ltr"
                    inputMode="decimal"
                    required
                    readOnly={currency === "USD"}
                    defaultValue={currency === "USD" ? "1" : ""}
                    pattern="[0-9]{1,18}(\.[0-9]{1,12})?"
                  />
                </label>
              </div>
              <p className="text-sm text-muted">{t("rateHelp")}</p>
              <h2>{t("lines")}</h2>
              {lines.map((line, i) => (
                <fieldset
                  className="journal-line"
                  key={line.key}
                  data-testid="draft-line"
                >
                  <legend>{t("lineNumber", { count: i + 1 })}</legend>
                  <label>
                    {t("account")}
                    <select
                      className="input"
                      required
                      value={line.accountId}
                      onChange={(e) =>
                        change(line.key, "accountId", e.target.value)
                      }
                    >
                      <option value="">{t("chooseAccount")}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {accountName(a, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="journal-fields">
                    {(["debit", "credit"] as const).map((side) => (
                      <label key={side}>
                        {t(side)}
                        <input
                          className="input"
                          dir="ltr"
                          inputMode="decimal"
                          pattern="[0-9]{1,14}(\.[0-9]{1,4})?"
                          value={line[side]}
                          onChange={(e) =>
                            change(line.key, side, e.target.value)
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {lines.length > 2 && (
                    <button
                      type="button"
                      className="journal-text-button"
                      onClick={() =>
                        setLines((old) => old.filter((l) => l.key !== line.key))
                      }
                    >
                      {t("removeLine")}
                    </button>
                  )}
                </fieldset>
              ))}
              <div className="journal-actions">
                <button
                  type="button"
                  className="journal-text-button"
                  disabled={lines.length >= 1000}
                  onClick={() =>
                    setLines((old) => [
                      ...old,
                      {
                        key: crypto.randomUUID(),
                        accountId: "",
                        debit: "",
                        credit: "",
                      },
                    ])
                  }
                >
                  {t("addLine")}
                </button>
                <button className="button" type="submit">
                  {pending ? t("working") : t("review")}
                </button>
              </div>
            </fieldset>
          </form>
          {preview && (
            <section className="journal-review" aria-label={t("review")}>
              <h2>{t("review")}</h2>
              <p>{t("confirmHelp")}</p>
              <article className="journal-line">
                <h3>{preview.summary.memo}</h3>
                <p>
                  {t("market")}:{" "}
                  <bdi dir="ltr">
                    {options.markets.find((m) => m.id === marketId)?.code}
                  </bdi>
                </p>
                <p>
                  {t("effectiveAt")}:{" "}
                  <bdi dir="ltr">{preview.summary.effectiveAt}</bdi>
                </p>
                <p>
                  {t("fxAsOf")}: <bdi dir="ltr">{preview.summary.fxAsOf}</bdi>
                </p>
              </article>
              <JournalLines lines={preview.lines} accounts={accounts} />
              <label className="journal-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={pending || locked}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t("confirm")}
              </label>
              <div className="journal-actions">
                <button
                  type="button"
                  className="journal-text-button"
                  disabled={pending || locked}
                  onClick={() => {
                    setPreview(null);
                    setError("");
                  }}
                >
                  {t("editDraft")}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={pending || !confirmed}
                  onClick={() =>
                    start(async () => {
                      try {
                        const result = await postJournal({
                          request: preview.request,
                          confirm: confirmed,
                        });
                        if (result.ok) setEntryId(result.value);
                        else setError(result.code);
                      } catch {
                        setError("UNKNOWN");
                      }
                    })
                  }
                >
                  {pending ? t("working") : locked ? t("retrySame") : t("post")}
                </button>
              </div>
            </section>
          )}
          {error && (
            <p className="finance-notice" role="alert">
              {t(`errors.${error}`)}
            </p>
          )}
          {pending && <p role="status">{t("working")}</p>}
        </>
      )}
      <Link className="journal-text-button" href="/admin/finance/journal">
        {t("back")}
      </Link>
    </div>
  );
}

export function ReversalForm({
  entryId,
  requestKey,
  today,
  minimum,
}: {
  entryId: string;
  requestKey: string;
  today: string;
  minimum: string;
}) {
  const t = useTranslations("journal"),
    [pending, start] = useTransition();
  const [request, setRequest] = useState<{
    entryId: string;
    requestKey: string;
    memo: string;
    effectiveAt: string;
  } | null>(null);
  const { error, setError, locked } = usePostingError();
  const [resultId, setResultId] = useState("");
  return (
    <section className="journal-form" data-testid="journal-reversal">
      <h2>{t("reverse")}</h2>
      <p>{t("reverseHelp")}</p>
      {resultId ? (
        <div role="status">
          <p>{t("reversed")}</p>
          <Link className="button" href={`/admin/finance/journal/${resultId}`}>
            {t("openEntry")}
          </Link>
        </div>
      ) : (
        <>
          <form
            hidden={!!request}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setError("");
              setRequest({
                entryId,
                requestKey,
                memo: String(data.get("memo")),
                effectiveAt: `${data.get("effectiveAt")}:00Z`,
              });
            }}
          >
            <label>
              {t("memo")}
              <textarea
                className="input"
                name="memo"
                required
                maxLength={500}
                rows={3}
              />
            </label>
            <label>
              {t("effectiveAt")}
              <input
                className="input"
                type="datetime-local"
                name="effectiveAt"
                dir="ltr"
                required
                min={minimum}
                defaultValue={today < minimum ? minimum : today}
              />
            </label>
            <p className="text-sm text-muted">{t("dateHelp")}</p>
            <button type="submit" className="button">
              {t("reviewReversal")}
            </button>
          </form>
          {request && (
            <div>
              <p>{t("reverseConfirm")}</p>
              <p>{request.memo}</p>
              <p>
                <bdi dir="ltr">{request.effectiveAt}</bdi>
              </p>
              <div className="journal-actions">
                <button
                  className="journal-text-button"
                  disabled={pending || locked}
                  onClick={() => {
                    setRequest(null);
                    setError("");
                  }}
                >
                  {t("editDraft")}
                </button>
                <button
                  className="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        const result = await reverseJournal({
                          request,
                          confirm: true,
                        });
                        if (result.ok) setResultId(result.value);
                        else setError(result.code);
                      } catch {
                        setError("UNKNOWN");
                      }
                    })
                  }
                >
                  {pending
                    ? t("working")
                    : locked
                      ? t("retrySame")
                      : t("confirmReverse")}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="finance-notice">
              {t(`errors.${error}`)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
