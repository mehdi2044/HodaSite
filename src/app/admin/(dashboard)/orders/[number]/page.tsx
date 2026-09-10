import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { adminOrder } from "@/modules/orders";
import { signedReceiptUrl } from "@/modules/payments";
import { db } from "@/lib/db";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { orderAction } from "../actions";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params,
    session = await auth(),
    t = await getTranslations("commerce"),
    order = await adminOrder(number, session?.user?.id ?? "").catch(() => null);
  if (!order) notFound();
  const canReview = await can(session!.user!.id!, "payment.receipt.approve", {
    marketId: order.marketId,
  });
  const address = order.shippingAddress as Record<string, string>,
    contact = order.contactSnapshot as Record<string, string>,
    returns = await db.returnRequest.findMany({ where: { orderId: order.id } });
  return (
    <main className="grid gap-7">
      <h1 className="text-2xl font-semibold">
        {order.number} ·{" "}
        <span data-testid="admin-order-status">
          {t(`statuses.${order.status}`)}
        </span>
      </h1>
      <p>
        {order.totalAmount.toString()} {order.currency} · {contact.firstName}{" "}
        {contact.lastName} · {contact.email}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-4 rounded-token border p-5">
          {order.items.map((i) => (
            <p key={i.id}>
              {(i.productSnapshot as { sku: string }).sku} × {i.quantity} —{" "}
              {i.lineTotalAmount.toString()} {i.currency}
            </p>
          ))}
          <h2 className="text-xl font-semibold">{t("timeline")}</h2>
          {order.events.map((e) => (
            <p key={e.id}>
              {e.createdAt.toLocaleString("fa")} ·{" "}
              {e.toStatus ? t(`statuses.${e.toStatus}`) : t("orderUpdated")}
            </p>
          ))}
          <h2 className="text-xl font-semibold">{t("returns")}</h2>
          {returns.length ? (
            returns.map((r) => <p key={r.id}>{r.reasonCode}</p>)
          ) : (
            <p>{t("noReturns")}</p>
          )}
        </section>
        <section className="grid content-start gap-5">
          {order.payments.map((p) => (
            <article key={p.id} className="rounded-token border p-5">
              <h2 className="font-semibold">
                {t(`paymentStatuses.${p.status}`)}
              </h2>
              {canReview &&
                p.receipts.map((r) => (
                  <a
                    className="my-3 block underline"
                    href={signedReceiptUrl(r.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={r.id}
                  >
                    {t("viewReceipt")}
                  </a>
                ))}
              {p.rejectReason && <p>{p.rejectReason}</p>}
            </article>
          ))}
          <CommerceForm action={orderAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <label>
              {t("operation")}
              <select className="input ms-3" name="operation">
                {["approve", "reject", "cash", "cancel", "extend", "note"].map(
                  (k) => (
                    <option key={k} value={k}>
                      {t(k)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              {t("reason")}
              <textarea
                className="input mt-2 w-full"
                name="reason"
                defaultValue={order.adminNote}
              />
            </label>
            <label>
              {t("hours")}
              <input
                className="input ms-3 w-24"
                type="number"
                name="hours"
                min="1"
                max="168"
                defaultValue="3"
              />
            </label>
            <button className="button">{t("apply")}</button>
          </CommerceForm>
          <details>
            <summary className="cursor-pointer py-3">
              {t("editAddress")}
            </summary>
            <CommerceForm action={orderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="operation" value="address" />
              {["line1", "city", "province", "postalCode"].map((k) => (
                <label key={k}>
                  {t(k)}
                  <input
                    className="input mt-2 w-full"
                    name={k}
                    defaultValue={address[k]}
                  />
                </label>
              ))}
              <button className="button">{t("save")}</button>
            </CommerceForm>
          </details>
        </section>
      </div>
    </main>
  );
}
