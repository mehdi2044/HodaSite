import { auth } from "@/modules/auth";
import { visibleOrderMarkets } from "@/modules/orders";
import { db } from "@/lib/db";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@/modules/access";
export default async function Dashboard() {
  const locale = await getLocale();
  const number = new Intl.NumberFormat(locale);
  const userId = (await auth())?.user?.id ?? "";
  const nav = await getTranslations("adminShell");
  const tasks = [
    [
      "catalog.product.create",
      "/admin/catalog/products/new",
      "taskProduct",
      "taskProductHelp",
    ],
    [
      "catalog.product.view",
      "/admin/catalog/taxonomy#taxonomy-category",
      "taskCategories",
      "taskCategoriesHelp",
    ],
    [
      "content.homepage.write",
      "/admin/content/homepage",
      "taskHomepage",
      "taskHomepageHelp",
    ],
    ["media.upload", "/admin/media", "taskMedia", "taskMediaHelp"],
  ] as const;
  const allowed = await Promise.all(
    tasks.map(([permission]) => can(userId, permission)),
  );
  const t = await getTranslations("commerce"),
    ids = await visibleOrderMarkets(userId),
    today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [sales, pending, orders] = await Promise.all([
    db.order.groupBy({
      by: ["currency"],
      where: { marketId: { in: ids }, paidAt: { gte: today } },
      _sum: { totalAmount: true },
    }),
    db.order.count({
      where: { marketId: { in: ids }, status: "AWAITING_VERIFICATION" },
    }),
    db.order.count({
      where: { marketId: { in: ids }, placedAt: { gte: today } },
    }),
  ]);
  return (
    <section className="admin-dashboard grid gap-6">
      <h1 className="text-2xl font-semibold">{t("dashboard")}</h1>
      <div className="grid gap-5 md:grid-cols-3">
        <article className="card admin-stat-card">
          <h2>{t("todaySales")}</h2>
          {sales.length ? (
            sales.map((s) => (
              <p className="mt-4 text-2xl font-semibold" key={s.currency}>
                <bdi dir="ltr">
                  {s._sum.totalAmount?.toString()} {s.currency}
                </bdi>
              </p>
            ))
          ) : (
            <p className="mt-4 text-2xl">{number.format(0)}</p>
          )}
        </article>
        <article className="card admin-stat-card">
          <h2>{t("pendingReviews")}</h2>
          <p className="mt-4 text-2xl">{number.format(pending)}</p>
        </article>
        <article className="card admin-stat-card">
          <h2>{t("todayOrders")}</h2>
          <p className="mt-4 text-2xl">{number.format(orders)}</p>
        </article>
      </div>
      {allowed.some(Boolean) && (
        <section
          className="admin-task-section"
          aria-labelledby="admin-tasks-heading"
        >
          <div className="admin-section-heading">
            <h2 id="admin-tasks-heading">{nav("everydayTasks")}</h2>
            <p>{nav("everydayTasksHelp")}</p>
          </div>
          <div className="admin-task-grid">
            {tasks.map(
              ([, href, title, help], index) =>
                allowed[index] && (
                  <Link className="admin-task-card" href={href} key={href}>
                    <span className="admin-task-number" aria-hidden="true">
                      {number.format(index + 1)}
                    </span>
                    <strong>{nav(title)}</strong>
                    <span>{nav(help)}</span>
                    <span className="admin-task-open">
                      {nav("openSection")} <span aria-hidden="true">↗</span>
                    </span>
                  </Link>
                ),
            )}
          </div>
        </section>
      )}
    </section>
  );
}
