import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { visibleFinanceMarkets } from "@/modules/finance";
import { marginReport, marginDimensions } from "@/modules/finance/margins";
import { Exact } from "@/modules/finance/operations-input";
export default async function MarginsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = (await auth())?.user?.id;
  if (!user) redirect("/admin/login");
  const [q, t, locale, markets] = await Promise.all([
    searchParams,
    getTranslations("financeOps"),
    getLocale(),
    visibleFinanceMarkets(user),
  ]);
  const market =
    markets.find((m) => m.id === q.marketId) ??
    (!q.marketId ? markets[0] : undefined);
  if (!market) redirect("/admin");
  const report = await marginReport(
    { marketId: market.id, from: q.from, to: q.to },
    q.dimension ?? "order",
  );
  const ids = report.rows.map((r) => r.key);
  const labels: Record<string, string> = {};
  // Only retrieve display names for already-authorized, immutable classification IDs.
  const translated = (v: unknown) =>
    String(
      (v as Record<string, string>)[locale] ??
        (v as Record<string, string>).en ??
        "",
    );
  if (report.dimension === "order")
    for (const r of await db.order.findMany({
      where: { id: { in: ids }, marketId: market.id },
      select: { id: true, number: true },
    }))
      labels[r.id] = r.number;
  if (report.dimension === "product")
    for (const r of await db.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, titleI18n: true },
    }))
      labels[r.id] = translated(r.titleI18n);
  if (report.dimension === "variant")
    for (const r of await db.variant.findMany({
      where: { id: { in: ids } },
      select: { id: true, sku: true },
    }))
      labels[r.id] = r.sku;
  if (report.dimension === "category")
    for (const r of await db.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, titleI18n: true },
    }))
      labels[r.id] = translated(r.titleI18n);
  if (report.dimension === "brand")
    for (const r of await db.brand.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameI18n: true },
    }))
      labels[r.id] = translated(r.nameI18n);
  for (const m of markets) labels[m.id] = m.code;
  const query = new URLSearchParams({
    marketId: market.id,
    from: report.filter.from,
    to: report.filter.to,
    dimension: report.dimension,
  });
  const max = report.rows.reduce(
    (n, r) => Exact.max(n, new Exact(r.revenueTry).abs()),
    new Exact(1),
  );
  return (
    <main className="grid min-w-0 gap-5">
      <header>
        <h1 className="text-2xl">{t("margins")}</h1>
        <p className="muted">{t("attributionHelp")}</p>
        <Link
          href={`/admin/finance/operations?marketId=${market.id}`}
          className="underline"
        >
          {t("title")}
        </Link>
      </header>
      <form className="card grid gap-3 sm:grid-cols-2">
        <label>
          {t("market")}
          <select name="marketId" className="input" defaultValue={market.id}>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("dimension")}
          <select
            name="dimension"
            className="input"
            defaultValue={report.dimension}
          >
            {marginDimensions.map((d) => (
              <option key={d} value={d}>
                {t(d)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("from")}
          <input
            className="input"
            type="date"
            name="from"
            defaultValue={report.filter.from}
          />
        </label>
        <label>
          {t("to")}
          <input
            className="input"
            type="date"
            name="to"
            defaultValue={report.filter.to}
          />
        </label>
        <button className="button">{t("filter")}</button>
      </form>
      <div className="flex gap-4">
        {["csv", "xlsx"].map((format) => (
          <a
            key={format}
            className="underline"
            href={`/admin/finance/margins/export?${query}&format=${format}`}
          >
            {t("export", { format: format.toUpperCase() })}
          </a>
        ))}
      </div>
      <p className="muted">{t("exactExport")}</p>
      {!report.rows.length && <p className="card">{t("empty")}</p>}
      {report.rows.map((r) => (
        <article className="card grid gap-3" key={r.key}>
          <h2 className="break-all font-semibold">
            {labels[r.key] ?? r.key ?? t("unassigned")}
          </h2>
          <div aria-hidden="true" className="h-2 rounded bg-stone-100">
            <div
              className="h-2 rounded bg-stone-500"
              style={{
                width: `${new Exact(r.revenueTry).abs().div(max).mul(100).toNumber()}%`,
              }}
            />
          </div>
          <dl className="grid sm:grid-cols-2">
            {(
              [
                "revenueTry",
                "revenueUsd",
                "costTry",
                "costUsd",
                "grossTry",
                "grossUsd",
                "expenseTry",
                "expenseUsd",
                "contributionTry",
                "contributionUsd",
                "marginPercent",
              ] as const
            ).map((k) => (
              <div key={k}>
                <dt className="muted">{t(k)}</dt>
                <dd className="break-all" dir="ltr">
                  {r[k] ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </main>
  );
}
