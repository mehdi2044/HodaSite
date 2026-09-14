import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { partnerStatement } from "@/modules/finance/margins";
export default async function Statement({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [p, q, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("financeOps"),
  ]);
  const report = await partnerStatement({ from: q.from, to: q.to }, p.id);
  return (
    <main className="grid min-w-0 gap-5">
      <h1 className="text-2xl">
        {t("statement")} — {report.partner.name}
      </h1>
      <Link
        className="underline"
        href={`/admin/finance/operations?marketId=${report.partner.marketId}`}
      >
        {t("partners")}
      </Link>
      <form className="card grid gap-3">
        <label>
          {t("from")}
          <input
            className="input"
            name="from"
            type="date"
            defaultValue={report.filter.from}
          />
        </label>
        <label>
          {t("to")}
          <input
            className="input"
            name="to"
            type="date"
            defaultValue={report.filter.to}
          />
        </label>
        <button className="button">{t("filter")}</button>
      </form>
      {report.totals.map((r) => (
        <section key={r.currency} className="card">
          <h2>{r.currency}</h2>
          <dl>
            {(["opening", "movement", "closing"] as const).map((k) => (
              <div key={k}>
                <dt>{t(k)}</dt>
                <dd dir="ltr">{r[k]}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {report.rows.map((r) => (
        <article className="card" key={r.id}>
          <h2>{t(r.kind)}</h2>
          <p>{r.memo}</p>
          <p dir="ltr">
            {r.effectiveAt.toISOString().slice(0, 10)} · {r.amount.toFixed(4)}{" "}
            {r.currency}
          </p>
          <Link
            className="underline"
            href={`/admin/finance/journal/${r.journalId}`}
          >
            {t("journal")}
          </Link>
        </article>
      ))}
    </main>
  );
}
