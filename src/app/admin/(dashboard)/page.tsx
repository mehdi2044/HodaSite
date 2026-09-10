import { auth } from "@/modules/auth";
import { visibleOrderMarkets } from "@/modules/orders";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
export default async function Dashboard() {
  const t = await getTranslations("commerce"),
    ids = await visibleOrderMarkets((await auth())?.user?.id ?? ""),
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
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t("dashboard")}</h1>
      <div className="grid gap-5 md:grid-cols-3">
        <article className="card">
          <h2>{t("todaySales")}</h2>
          {sales.length ? (
            sales.map((s) => (
              <p className="mt-4 text-2xl font-semibold" key={s.currency}>
                {s._sum.totalAmount?.toString()} {s.currency}
              </p>
            ))
          ) : (
            <p className="mt-4 text-2xl">0</p>
          )}
        </article>
        <article className="card">
          <h2>{t("pendingReviews")}</h2>
          <p className="mt-4 text-2xl">{pending}</p>
        </article>
        <article className="card">
          <h2>{t("todayOrders")}</h2>
          <p className="mt-4 text-2xl">{orders}</p>
        </article>
      </div>
    </section>
  );
}
