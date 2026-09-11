import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentCustomer } from "@/modules/customers";
import { returnPolicySchema } from "@/modules/returns/validation";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { requestReturnAction } from "@/app/[locale]/returns/actions";
export async function CustomerReturns({
  orderId,
  locale,
  orderNumber,
}: {
  orderId: string;
  locale: string;
  orderNumber: string;
}) {
  const t = await getTranslations("returns"),
    customer = await currentCustomer();
  if (!customer)
    return (
      <Link
        className="underline"
        href={`/${locale}/account/login?next=${encodeURIComponent(`/${locale}/orders/${orderNumber}/pay`)}`}
      >
        {t("login")}
      </Link>
    );
  const order = await db.order.findFirst({
    where: { id: orderId, customerId: customer.id },
    include: {
      market: true,
      items: { include: { variant: true } },
      returns: { include: { items: true }, orderBy: { createdAt: "desc" } },
      exchanges: { select: { id: true, number: true } },
    },
  });
  if (!order) return null;
  const policy = returnPolicySchema.parse(order.market.returnSettings);
  const eligible =
    order.status === "DELIVERED" &&
    order.deliveredAt &&
    policy.enabled &&
    Date.now() <= order.deliveredAt.getTime() + policy.days * 86400000;
  const variants = eligible
    ? await db.variant.findMany({
        where: {
          productId: { in: order.items.map((i) => i.variant.productId) },
          isActive: true,
          product: {
            deletedAt: null,
            status: "ACTIVE",
            OR: [
              { marketIds: { isEmpty: true } },
              { marketIds: { has: order.marketId } },
            ],
          },
        },
        include: { color: true, size: true },
      })
    : [];
  return (
    <section
      className="grid gap-5 rounded-token border border-black/10 p-5"
      data-testid="customer-returns"
    >
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p className="text-muted">{t("policy", { days: policy.days })}</p>
      {order.returns.map((r) => (
        <article className="grid gap-2 border-b pb-4" key={r.id}>
          <p>
            {t(`statuses.${r.status}`)} · {t(`reasons.${r.reasonCode}`)}
          </p>
          <p>
            {t("value")}:{" "}
            <bdi dir="ltr">
              {r.refundAmount.toString()} {order.currency}
            </bdi>
          </p>
          {r.decisionNote && <p>{r.decisionNote}</p>}
          {r.exchangeOrderId &&
            order.exchanges
              .filter((e) => e.id === r.exchangeOrderId)
              .map((e) => (
                <Link
                  className="underline"
                  key={e.id}
                  href={`/${locale}/orders/${e.number}/pay`}
                >
                  {t("exchangeOrder")} <bdi dir="ltr">{e.number}</bdi>
                </Link>
              ))}
        </article>
      ))}
      {!eligible && <p>{t("unavailable")}</p>}
      {eligible &&
        order.items.map((i) => {
          const used = order.returns
            .filter((r) => r.status !== "REJECTED")
            .flatMap((r) => r.items)
            .filter((r) => r.orderItemId === i.id)
            .reduce((n, r) => n + r.quantity, 0);
          const left = i.quantity - used;
          if (left <= 0) return null;
          return (
            <CommerceForm action={requestReturnAction} key={`${i.id}:${used}`}>
              <p>
                <bdi dir="ltr">
                  {(i.productSnapshot as { sku: string }).sku}
                </bdi>
              </p>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="orderItemId" value={i.id} />
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <label>
                {t("type")}
                <select className="input w-full" name="type">
                  <option value="RETURN">{t("return")}</option>
                  <option value="EXCHANGE">{t("exchange")}</option>
                </select>
              </label>
              <label>
                {t("quantity")}
                <input
                  className="input w-full"
                  type="number"
                  name="quantity"
                  min={1}
                  max={left}
                  defaultValue={1}
                  required
                />
              </label>
              <label>
                {t("reason")}
                <select className="input w-full" name="reasonCode">
                  {["SIZE", "COLOR", "DEFECT", "OTHER"].map((k) => (
                    <option key={k} value={k}>
                      {t(`reasons.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("replacement")}
                <select className="input w-full" name="exchangeVariantId">
                  <option value="">{t("none")}</option>
                  {variants
                    .filter(
                      (v) =>
                        v.productId === i.variant.productId &&
                        v.id !== i.variantId,
                    )
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {(v.color.nameI18n as Record<string, string>)[locale]} ·{" "}
                        {v.size.value} · {v.sku}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t("note")}
                <textarea
                  className="input w-full"
                  name="note"
                  maxLength={2000}
                />
              </label>
              <button className="button justify-self-start">
                {t("request")}
              </button>
            </CommerceForm>
          );
        })}
    </section>
  );
}
