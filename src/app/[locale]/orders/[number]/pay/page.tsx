import { InvoicePanel } from "@/components/invoices/panel";
import { TrackingTimeline } from "@/components/shipping/tracking-timeline";
import { trackingView } from "@/modules/shipping/tracking";
import { currentCustomer } from "@/modules/customers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { authorizedOrder } from "@/modules/orders";
import { signedReceiptUrl } from "@/modules/payments";
import { CommerceForm } from "@/components/storefront/commerce-form";
import {
  CopyBank,
  PaymentDeadline,
} from "@/components/storefront/payment-details";
import { uploadReceiptAction } from "../../../commerce-actions";
export const dynamic = "force-dynamic";
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ locale: string; number: string }>;
}) {
  const { locale, number } = await params,
    t = await getTranslations("commerce");
  const order = await authorizedOrder(number).catch(() => null);
  if (!order) {
    if (!(await currentCustomer()))
      redirect(
        `/${locale}/account/login?next=${encodeURIComponent(`/${locale}/orders/${number}/pay`)}`,
      );
    notFound();
  }
  const banks = order.bankSnapshot as Array<{
    id: string;
    bankName: string;
    holder: string;
    iban: string;
    accountNumber: string;
    cardNumber: string;
    instructionsI18n: Record<string, string>;
  }>;
  const support = order.market.supportChannels as Record<string, string>;
  const supportLinks: Array<{ key: string; url: string }> = [];
  for (const key of ["whatsapp", "telegram"]) {
    const raw = support?.[key];
    if (!raw) continue;
    try {
      const url = new URL(
        raw.startsWith("https://")
          ? raw
          : key === "whatsapp"
            ? `https://wa.me/${raw.replace(/[^0-9]/g, "")}`
            : `https://t.me/${raw.replace(/^@/, "")}`,
      );
      if (
        url.protocol !== "https:" ||
        !(
          key === "whatsapp" ? ["wa.me", "api.whatsapp.com"] : ["t.me"]
        ).includes(url.hostname)
      )
        continue;
      url.searchParams.set("text", `${t("order")} ${order.number}`);
      supportLinks.push({ key, url: url.toString() });
    } catch {
      /* Ignore unconfigured channels. */
    }
  }
  const pending =
    order.status === "PENDING_PAYMENT" && order.paymentDeadlineAt > new Date();
  return (
    <main className="shell grid gap-7 py-10">
      <div>
        <p className="text-muted">{t("order")}</p>
        <h1 className="text-3xl font-semibold" dir="ltr">
          {order.number}
        </h1>
        <p className="mt-3 text-lg text-primary" data-testid="order-status">
          {t(`statuses.${order.status}`)}
        </p>
      </div>
      <div className="grid gap-7 lg:grid-cols-2">
        <section className="grid content-start gap-5 rounded-token border border-black/10 bg-surface p-6">
          <h2 className="text-xl font-semibold">
            {t("total")}:{" "}
            <span dir="ltr">
              {order.totalAmount.toString()} {order.currency}
            </span>
          </h2>
          <p className="text-muted">
            {t("holdExplanation", {
              hours: Math.max(
                0,
                Math.round(
                  (order.holdExpiresAt.getTime() - order.placedAt.getTime()) /
                    3600000,
                ),
              ),
            })}
          </p>
          {pending && (
            <PaymentDeadline deadline={order.paymentDeadlineAt.toISOString()} />
          )}
          <dl className="grid gap-3">
            {order.items.map((item) => (
              <div className="flex justify-between gap-3" key={item.id}>
                <dt>
                  {
                    (item.productSnapshot as { title: Record<string, string> })
                      .title[locale]
                  }{" "}
                  × {item.quantity}
                </dt>
                <dd>
                  {item.lineTotalAmount.toString()} {order.currency}
                </dd>
              </div>
            ))}
            {order.fees.map((fee) => (
              <div className="flex justify-between" key={fee.id}>
                <dt>{fee.label}</dt>
                <dd>
                  {fee.absorbed ? "0" : fee.amount.toString()} {fee.currency}
                </dd>
              </div>
            ))}
          </dl>
          <h2 className="text-xl font-semibold">{t("timeline")}</h2>
          <ol className="grid gap-3 border-s-2 border-primary ps-4">
            {order.events.map((event) => (
              <li key={event.id}>
                <p>
                  {event.toStatus
                    ? t(`statuses.${event.toStatus}`)
                    : t("orderUpdated")}
                </p>
                <time className="text-sm text-muted">
                  {event.createdAt.toLocaleString(locale)}
                </time>
              </li>
            ))}
          </ol>
        </section>
        <section className="grid content-start gap-5">
          {pending && (
            <>
              <h2 className="text-xl font-semibold">{t("bankTransfer")}</h2>
              {banks.map((bank) => (
                <div
                  key={bank.id}
                  className="rounded-token border border-black/10 bg-surface p-5"
                >
                  <h3 className="font-semibold">{bank.bankName}</h3>
                  <p>{bank.holder}</p>
                  {[bank.iban, bank.accountNumber, bank.cardNumber]
                    .filter(Boolean)
                    .map((value) => (
                      <div
                        key={value}
                        className="my-3 flex flex-wrap items-center justify-between gap-2"
                      >
                        <span dir="ltr">{value}</span>
                        <CopyBank value={value} />
                      </div>
                    ))}
                  <p className="text-sm text-muted">
                    {bank.instructionsI18n[locale]}
                  </p>
                </div>
              ))}
              <CommerceForm
                action={uploadReceiptAction.bind(null, locale, number)}
                className="grid gap-4 rounded-token border border-black/10 bg-surface p-6"
              >
                <h2 className="text-xl font-semibold">{t("uploadReceipt")}</h2>
                <p className="text-sm text-muted">{t("receiptHint")}</p>
                <label>
                  {t("receipt")}
                  <input
                    className="input mt-2 w-full"
                    type="file"
                    name="receipt"
                    accept="image/jpeg,image/png,application/pdf"
                    required
                  />
                </label>
                <label>
                  {t("reference")}
                  <input
                    className="input mt-2 w-full"
                    name="reference"
                    maxLength={200}
                  />
                </label>
                <label>
                  {t("note")}
                  <textarea
                    className="input mt-2 w-full"
                    name="note"
                    maxLength={2000}
                  />
                </label>
                <button className="button">{t("submitReceipt")}</button>
              </CommerceForm>
            </>
          )}
          {pending &&
            supportLinks.map((s) => (
              <a
                className="underline"
                key={s.key}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("sendViaSupport", {
                  channel: s.key === "whatsapp" ? "WhatsApp" : "Telegram",
                })}
              </a>
            ))}
          {order.payments
            .filter((p) => p.receipts.length)
            .map((payment) => (
              <article
                key={payment.id}
                className="rounded-token bg-surface p-5"
              >
                <p className="font-semibold">
                  {t(`paymentStatuses.${payment.status}`)}
                </p>
                {payment.rejectReason && (
                  <p className="my-2 text-error">{payment.rejectReason}</p>
                )}
                {payment.receipts.map((receipt) => (
                  <a
                    className="mt-3 block underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    key={receipt.id}
                    href={signedReceiptUrl(receipt.id)}
                  >
                    {t("viewReceipt")}
                  </a>
                ))}
              </article>
            ))}
        </section>
      </div>
      <TrackingTimeline value={await trackingView(order.id)} />
      <Link className="underline" href={`/${locale}/tracking`}>
        {(await getTranslations("shipping"))("tracking")}
      </Link>
      <Link className="underline" href={`/${locale}/account`}>
        {t("account")}
      </Link>
      <InvoicePanel orderId={order.id} number={order.number} marketId={order.marketId} paidAt={order.paidAt} />
    </main>
  );
}
