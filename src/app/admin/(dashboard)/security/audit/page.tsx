import { requireAdminPage } from "@/modules/auth/page";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    entity?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await requireAdminPage("audit.view");
  const q = await searchParams,
    t = await getTranslations("security");
  const start =
    q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? new Date(q.from) : undefined;
  const end =
    q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)
      ? new Date(`${q.to}T23:59:59.999Z`)
      : undefined;
  const rows = await db.auditLog.findMany({
    where: {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.entity ? { entityType: q.entity.slice(0, 100) } : {}),
      ...(q.action ? { action: { contains: q.action.slice(0, 100) } } : {}),
      createdAt: {
        gte: start && !Number.isNaN(+start) ? start : undefined,
        lte: end && !Number.isNaN(+end) ? end : undefined,
      },
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="grid gap-4">
      <h1>{t("audit")}</h1>
      <form className="card flex flex-wrap gap-3">
        <label>
          {t("action")}
          <input className="input" name="action" defaultValue={q.action} />
        </label>
        <label>
          {t("entity")}
          <input className="input" name="entity" defaultValue={q.entity} />
        </label>
        <label>
          {t("from")}
          <input
            type="date"
            className="input"
            name="from"
            defaultValue={q.from}
          />
        </label>
        <label>
          {t("to")}
          <input type="date" className="input" name="to" defaultValue={q.to} />
        </label>
        <button className="button">{t("filter")}</button>
      </form>
      {rows.map((row) => (
        <details className="card" key={row.id}>
          <summary>
            <bdi>{row.action}</bdi> · {row.user?.name ?? t("system")} ·{" "}
            {row.createdAt.toLocaleString("fa")}
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3>{t("before")}</h3>
              <pre className="overflow-auto text-xs" dir="ltr">
                {JSON.stringify(row.before, null, 2)}
              </pre>
            </div>
            <div>
              <h3>{t("after")}</h3>
              <pre className="overflow-auto text-xs" dir="ltr">
                {JSON.stringify(row.after, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
