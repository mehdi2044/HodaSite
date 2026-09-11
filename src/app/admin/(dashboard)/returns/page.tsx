import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { returnMarkets } from "@/modules/returns/service";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { manageReturnAction } from "./actions";
export default async function ReturnsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const ids = await returnMarkets(session.user.id);
  if (!ids.length) notFound();
  const t = await getTranslations("returns");
  const rows = await db.returnRequest.findMany({
    where: { order: { marketId: { in: ids } } },
    include: {
      items: { include: { orderItem: true } },
      order: { select: { number: true, marketId: true, currency: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <main className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Link className="underline" href="/admin/returns/settings">
        {t("settings")}
      </Link>
      {!rows.length && <p>{t("empty")}</p>}
      {await Promise.all(
        rows.map(async (r) => {
          const settlement = await can(session.user!.id!, "payment.refund", {
            marketId: r.order.marketId,
          });
          const operations =
            r.status === "REQUESTED"
              ? ["APPROVE", "REJECT"]
              : r.status === "APPROVED"
                ? ["IN_TRANSIT", "RECEIVE"]
                : r.status === "IN_TRANSIT"
                  ? ["RECEIVE"]
                  : r.status === "RECEIVED" && settlement
                    ? r.type === "EXCHANGE"
                      ? ["EXCHANGE"]
                      : ["REFUND", "CREDIT"]
                    : [];
          return (
            <article
              key={r.id}
              className="grid gap-3 rounded-token border p-5"
              data-testid="admin-return"
            >
              <h2 className="text-xl">
                <bdi dir="ltr">{r.order.number}</bdi> ·{" "}
                {t(`statuses.${r.status}`)}
              </h2>
              <p>
                {t(`reasons.${r.reasonCode}`)} · {r.note}
              </p>
              <p>
                {t("value")}:{" "}
                <bdi dir="ltr">
                  {r.refundAmount.toString()} {r.order.currency}
                </bdi>
              </p>
              {r.items.map((i) => (
                <p key={i.id}>
                  <bdi dir="ltr">
                    {(i.orderItem.productSnapshot as { sku: string }).sku}
                  </bdi>{" "}
                  × {i.quantity}
                </p>
              ))}
              {operations.map((operation) => (
                <CommerceForm
                  key={`${r.id}:${r.version}:${operation}`}
                  action={manageReturnAction}
                  className="grid gap-3 border-t pt-4"
                >
                  <input type="hidden" name="returnId" value={r.id} />
                  <input type="hidden" name="version" value={r.version} />
                  <input type="hidden" name="operation" value={operation} />
                  {operation === "RECEIVE" &&
                    r.items.map((i) => (
                      <label key={i.id}>
                        <bdi dir="ltr">
                          {(i.orderItem.productSnapshot as { sku: string }).sku}
                        </bdi>
                        <input type="hidden" name="itemId" value={i.id} />
                        <select
                          className="input w-full"
                          name={`condition:${i.id}`}
                          defaultValue="QUARANTINE"
                        >
                          {["RESTOCK", "QUARANTINE", "DAMAGED"].map((c) => (
                            <option key={c} value={c}>
                              {t(`conditions.${c}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  <label>
                    {t(operation === "REFUND" ? "refundReference" : "note")}
                    <textarea
                      className="input w-full"
                      name="note"
                      maxLength={2000}
                      required={
                        operation === "REFUND" || operation === "REJECT"
                      }
                    />
                  </label>
                  {operation === "REFUND" && (
                    <p className="text-muted">{t("manualRefund")}</p>
                  )}
                  {operation === "EXCHANGE" && (
                    <p className="text-muted">{t("exchangeNotice")}</p>
                  )}
                  <button className="button justify-self-start">
                    {t(`operations.${operation}`)}
                  </button>
                </CommerceForm>
              ))}
            </article>
          );
        }),
      )}
    </main>
  );
}
