import { ExpenseAttachment } from "@/components/admin/expense-attachment";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { visibleFinanceMarkets } from "@/modules/finance";
import {
  financeWorkspace,
  financeDashboard,
} from "@/modules/finance/dashboard";
import {
  FinanceOperationForm,
  PurchaseLines,
} from "@/components/admin/finance-operation-form";
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = (await auth())?.user?.id;
  if (!user) redirect("/admin/login");
  const [t, locale, q, markets] = await Promise.all([
    getTranslations("financeOps"),
    getLocale(),
    searchParams,
    visibleFinanceMarkets(user),
  ]);
  const market =
    markets.find((m) => m.id === q.marketId) ??
    (q.marketId ? undefined : markets[0]);
  if (!market) redirect("/admin");
  const w = await financeWorkspace(market.id),
    dashboard = await financeDashboard({
      marketId: market.id,
      from: q.from,
      to: q.to,
    });
  const write = await can(user, "finance.journal.post", {
      marketId: market.id,
    }),
    expense = await can(user, "finance.expense.create", {
      marketId: market.id,
    });
  const now = new Date().toISOString().slice(0, 16);
  const field = (name: string, value = "", type = "text") => (
    <label className="grid gap-1">
      {t(name)}
      <input
        className="input w-full"
        name={name}
        defaultValue={value}
        type={type}
        required
        maxLength={500}
      />
    </label>
  );
  const confirm = (
    <label className="flex gap-2">
      <input type="checkbox" name="confirm" required />
      {t("confirm")}
    </label>
  );
  const rates = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label>
        {t("currency")}
        <select className="input w-full" name="currency">
          {["TRY", "USD", "CAD", "IRT"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {field("rateTry", "1")}
      {field("rateUsd")}
      {field("fxAsOf", now, "datetime-local")}
      {field("effectiveAt", now, "datetime-local")}
      <p className="muted sm:col-span-2">{t("ratesHelp")}</p>
    </div>
  );
  const form = (kind: string, children: React.ReactNode) => (
    <FinanceOperationForm
      kind={kind}
      marketId={market.id}
      requestKey={randomUUID()}
    >
      {children}
    </FinanceOperationForm>
  );
  const title = (key: string) => (
    <h2 className="text-xl font-semibold">{t(key)}</h2>
  );
  return (
    <main className="grid min-w-0 gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="muted">{t("intro")}</p>
        <Link className="underline" href="/admin/finance">
          {t("reports")}
        </Link>
      </header>
      <Link
        className="underline"
        href={`/admin/finance/margins?marketId=${market.id}`}
      >
        {t("margins")}
      </Link>
      <form className="flex flex-wrap gap-3">
        <label>
          {t("market")}
          <select name="marketId" defaultValue={market.id} className="input">
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("from")}
          <input
            type="date"
            name="from"
            defaultValue={q.from}
            className="input"
          />
        </label>
        <label>
          {t("to")}
          <input type="date" name="to" defaultValue={q.to} className="input" />
        </label>
        <button className="button">{t("filter")}</button>
      </form>
      <section className="card grid gap-3">
        {title("profit")}
        <p className="muted">{t("profitHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(dashboard.totals).map(([key, value]) => (
            <div className="rounded border p-3" key={key}>
              <p>{t(key)}</p>
              <strong dir="ltr" className="break-all text-lg">
                {value}
              </strong>
            </div>
          ))}
        </div>
      </section>
      {write && (
        <details className="card">
          <summary className="cursor-pointer text-xl">{t("config")}</summary>
          {form(
            "config",
            <>
              <p className="muted">{t("cutover")}</p>
              <label>
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={w.config?.enabled}
                />
                {t("enabled")}
              </label>
              {field(
                "marginPercent",
                w.config?.marginPercent.toString() ?? "10",
              )}
              {field("slowDays", String(w.config?.slowDays ?? 90), "number")}
              {field(
                "deviationPercent",
                w.config?.deviationPercent.toString() ?? "50",
              )}
              {confirm}
            </>,
          )}
        </details>
      )}
      {write && (
        <details className="card">
          <summary className="cursor-pointer text-xl">{t("supplier")}</summary>
          {form(
            "supplier",
            <>
              {field("name")}
              <label>
                {t("notes")}
                <textarea
                  className="input w-full"
                  name="notes"
                  maxLength={2000}
                />
              </label>
            </>,
          )}
        </details>
      )}
      <section className="card grid gap-4">
        {title("purchases")}
        {write &&
          form(
            "purchase",
            <>
              <label>
                {t("supplier")}
                <select className="input w-full" name="supplierId" required>
                  {w.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("warehouse")}
                <select className="input w-full" name="warehouseId" required>
                  {w.warehouses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(
                        (s.nameI18n as Record<string, string>)[locale] ?? s.id,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              {field("memo")}
              {rates}
              {field("additionalCost", "0")}
              <label>
                {t("allocation")}
                <select className="input w-full" name="allocation">
                  <option value="VALUE">{t("byValue")}</option>
                  <option value="WEIGHT">{t("byWeight")}</option>
                </select>
              </label>
              <PurchaseLines variants={w.variants} />
              {confirm}
            </>,
          )}
        <p className="muted">{t("recentLimit")}</p>
        {w.purchases.map((p) => (
          <article key={p.id} className="grid gap-2 rounded border p-3">
            <strong>
              {p.supplier.name} — {p.memo}
            </strong>
            <span>{t(p.status)}</span>
            {p.items.map((i) => (
              <p key={i.id} dir="ltr">
                {w.variants.find((v) => v.id === i.variantId)?.sku ??
                  i.variantId}
                : {i.quantity} × {i.unitCost.toFixed(4)} {p.currency}
              </p>
            ))}
            {write &&
              p.status === "DRAFT" &&
              form(
                "receive",
                <>
                  <input type="hidden" name="id" value={p.id} />
                  <p>{t("receive")}</p>
                  {confirm}
                </>,
              )}
          </article>
        ))}
      </section>
      <section className="card grid gap-4">
        {title("expenses")}
        {expense &&
          form(
            "expense",
            <>
              {field("category")}
              <ExpenseAttachment marketId={market.id} />
              {field("memo")}
              {field("amount")}
              {rates}
              <label>
                {t("recurrenceMonths")}
                <input
                  className="input w-full"
                  name="recurrenceMonths"
                  type="number"
                  min="0"
                  max="12"
                  defaultValue="0"
                />
              </label>
              {confirm}
            </>,
          )}
        {w.expenses.map((e) => (
          <article key={e.id} className="grid gap-2 rounded border p-3">
            <strong>
              {e.category} — {e.memo}
            </strong>
            <span dir="ltr">
              {e.amount.toFixed(4)} {e.currency}
            </span>
            <span>{t(e.status)}</span>
            {e.attachmentId && (
              <a
                className="underline"
                href={`/api/admin/finance/attachments/${e.attachmentId}`}
              >
                {t("attachment")}
              </a>
            )}
            {e.journalId && (
              <Link
                className="underline"
                href={`/admin/finance/journal/${e.journalId}`}
              >
                {t("journal")}
              </Link>
            )}
            {write &&
              e.status === "PENDING" &&
              form(
                "approve",
                <>
                  <input type="hidden" name="id" value={e.id} />
                  <p>{t("approve")}</p>
                  {confirm}
                </>,
              )}
          </article>
        ))}
      </section>
      <section className="card grid gap-4">
        {title("partners")}
        {write &&
          form(
            "partner",
            <>
              {field("name")}
              {field("ownershipPercent")}
            </>,
          )}
        {w.partners.map((p) => (
          <p key={p.id}>
            {p.name} — {p.ownershipPercent.toString()}%
          </p>
        ))}
        {write &&
          form(
            "capital",
            <>
              <label>
                {t("partner")}
                <select name="partnerId" className="input w-full" required>
                  {w.partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("kind")}
                <select name="kind" className="input w-full">
                  {["CONTRIBUTION", "WITHDRAWAL", "PROFIT_SHARE"].map((k) => (
                    <option key={k} value={k}>
                      {t(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("purchaseOrderId")}
                <select name="purchaseOrderId" className="input">
                  <option value="">—</option>
                  {w.purchases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.memo}
                    </option>
                  ))}
                </select>
              </label>
              {field("memo")}
              {field("amount")}
              {rates}
              {confirm}
            </>,
          )}
        {w.capital.map((c) => (
          <article key={c.id} className="rounded border p-3">
            <strong>
              {c.partner.name} — {t(c.kind)}
            </strong>
            <p dir="ltr">
              {c.amount.toFixed(4)} {c.currency}
            </p>
            <Link
              className="underline"
              href={`/admin/finance/journal/${c.journalId}`}
            >
              {t("journal")}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
