import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { visibleOrderMarkets } from "@/modules/orders";
import { db } from "@/lib/db";
import { OrderStatus } from "@prisma/client";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { saveOrderViewAction, bulkOrderAction } from "./actions";
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await auth(),
    t = await getTranslations("commerce"),
    query = await searchParams,
    marketIds = await visibleOrderMarkets(session?.user?.id ?? "");
  const user = session?.user?.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { orderViews: true },
      })
    : null;
  const views = Array.isArray(user?.orderViews)
    ? (user.orderViews as Array<{ name: string; q: string; status: string }>)
    : [];
  const status = Object.values(OrderStatus).includes(
    query.status as OrderStatus,
  )
    ? (query.status as OrderStatus)
    : undefined;
  const orders = await db.order.findMany({
    where: {
      marketId: { in: marketIds },
      ...(status ? { status } : {}),
      ...(query.q
        ? {
            number: {
              contains: query.q.slice(0, 100),
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    orderBy: { placedAt: "desc" },
    take: 100,
  });
  return (
    <main className="grid gap-6">
      <div className="flex flex-wrap justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("orders")}</h1>
        <Link className="underline" href="/admin/payments/banks">
          {t("bankAccounts")}
        </Link>
        <a className="underline" href="/admin/orders/export">
          {t("export")}
        </a>
      </div>
      <form className="flex flex-wrap gap-3">
        <input
          className="input"
          name="q"
          placeholder={t("orderNumber")}
          defaultValue={query.q}
        />
        <select
          className="input"
          name="status"
          defaultValue={query.status ?? ""}
        >
          <option value="">{t("all")}</option>
          {Object.values(OrderStatus).map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        <button className="button">{t("filter")}</button>
      </form>
      <details>
        <summary>{t("savedViews")}</summary>
        <div className="flex flex-wrap gap-3 py-4">
          {views.map((v) => (
            <Link
              className="underline"
              key={v.name}
              href={`/admin/orders?${new URLSearchParams({ q: v.q, status: v.status })}`}
            >
              {v.name}
            </Link>
          ))}
        </div>
        <CommerceForm action={saveOrderViewAction}>
          <input type="hidden" name="q" value={query.q ?? ""} />
          <input type="hidden" name="status" value={query.status ?? ""} />
          <label>
            {t("viewName")}
            <input className="input ms-3" name="name" required maxLength={60} />
          </label>
          <button className="button">{t("saveView")}</button>
        </CommerceForm>
      </details>
      <CommerceForm action={bulkOrderAction}>
        <div className="overflow-auto rounded-token border">
          <table className="w-full text-start">
            <thead>
              <tr>
                {["select", "order", "status", "total", "date"].map((k) => (
                  <th className="p-3 text-start" key={k}>
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr className="border-t" key={o.id}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      name="orderId"
                      value={o.id}
                      aria-label={o.number}
                    />
                  </td>
                  <td className="p-3">
                    <Link
                      className="underline"
                      href={`/admin/orders/${o.number}`}
                    >
                      {o.number}
                    </Link>
                  </td>
                  <td className="p-3">{t(`statuses.${o.status}`)}</td>
                  <td className="p-3">
                    {o.totalAmount.toString()} {o.currency}
                  </td>
                  <td className="p-3">{o.placedAt.toLocaleDateString("fa")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3">
          <select className="input" name="operation">
            <option value="approve">{t("approve")}</option>
            <option value="cancel">{t("cancel")}</option>
          </select>
          <input className="input" name="reason" placeholder={t("reason")} />
          <button className="button">{t("applySelected")}</button>
        </div>
      </CommerceForm>
    </main>
  );
}
