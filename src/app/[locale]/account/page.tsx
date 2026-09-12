import { Iso } from "@/components/storefront/iso";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentCustomer } from "@/modules/customers";
import { CommerceForm } from "@/components/storefront/commerce-form";
import {
  profileAction,
  logoutCustomerAction,
  deletionRequestAction,
  saveCustomerAddressAction,
} from "../commerce-actions";
export const dynamic = "force-dynamic";
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations("commerce"),
    customer = await currentCustomer();
  if (!customer) redirect(`/${locale}/account/login`);
  const [orders, addresses, markets] = await Promise.all([
    db.order.findMany({
      where: { customerId: customer.id },
      orderBy: { placedAt: "desc" },
      take: 100,
    }),
    db.address.findMany({ where: { customerId: customer.id } }),
    db.market.findMany({ where: { isActive: true } }),
  ]);
  return (
    <main className="shell shop-page shop-account grid gap-8 py-10">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-3xl font-semibold">{t("account")}</h1>
        <form action={logoutCustomerAction.bind(null, locale)}>
          <button className="shop-text-button underline">{t("logout")}</button>
        </form>
      </div>
      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">{t("orders")}</h2>
        {orders.length ? (
          orders.map((order) => (
            <Link
              className="flex flex-wrap justify-between gap-3 rounded-token border border-black/10 bg-surface p-5"
              prefetch={false}
              key={order.id}
              href={`/${locale}/orders/${order.number}/pay`}
            >
              <Iso>{order.number}</Iso>
              <span>{t(`statuses.${order.status}`)}</span>
              <Iso>
                {order.totalAmount.toString()} {order.currency}
              </Iso>
            </Link>
          ))
        ) : (
          <p className="text-muted">{t("noOrders")}</p>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-xl font-semibold">
          {(await getTranslations("returns"))("creditBalance")}
        </h2>
        {(
          await db.storeCredit.groupBy({
            by: ["currency"],
            where: {
              customerId: customer.id,
              balance: { gt: 0 },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            _sum: { balance: true },
          })
        ).map((c) => (
          <p key={c.currency}>
            <bdi dir="ltr">
              {c._sum.balance?.toString()} {c.currency}
            </bdi>
          </p>
        ))}
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-token bg-surface p-6">
          <h2 className="mb-5 text-xl font-semibold">{t("profile")}</h2>
          <CommerceForm action={profileAction.bind(null, locale)}>
            {["firstName", "lastName", "phone", "gender"].map((key) => (
              <label key={key}>
                {t(key)}
                <input
                  className="input mt-2 w-full"
                  name={key}
                  defaultValue={
                    (customer as unknown as Record<string, string>)[key] ?? ""
                  }
                />
              </label>
            ))}
            <label>
              {t("birthDate")}
              <input
                className="input mt-2 w-full"
                type="date"
                name="birthDate"
                defaultValue={customer.birthDate?.toISOString().slice(0, 10)}
              />
            </label>
            <label>
              {t("language")}
              <select
                className="input ms-3"
                name="locale"
                defaultValue={customer.locale}
              >
                <option value="fa">فارسی</option>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {t("market")}
              <select
                className="input ms-3"
                name="preferredMarketId"
                defaultValue={customer.preferredMarketId ?? markets[0]?.id}
              >
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code}
                  </option>
                ))}
              </select>
            </label>
            <button className="button">{t("save")}</button>
          </CommerceForm>
        </section>
        <section className="grid content-start gap-5 rounded-token bg-surface p-6">
          <h2 className="text-xl font-semibold">{t("addresses")}</h2>
          {addresses.map((a) => (
            <p key={a.id}>
              {a.label}: {a.line1}، {a.city}، {a.province} ({a.country})
            </p>
          ))}
          <details>
            <summary className="cursor-pointer py-3 font-semibold">
              {t("addAddress")}
            </summary>
            <CommerceForm action={saveCustomerAddressAction.bind(null, locale)}>
              {[
                "label",
                "province",
                "city",
                "line1",
                "line2",
                "postalCode",
                "phone",
              ].map((key) => (
                <label key={key}>
                  {t(key)}
                  <input
                    className="input mt-2 w-full"
                    name={key}
                    required={!["line2", "postalCode"].includes(key)}
                  />
                </label>
              ))}
              <label>
                {t("country")}
                <select className="input ms-3" name="country">
                  {markets.map((m) => (
                    <option key={m.id} value={m.code}>
                      {m.code}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button">{t("save")}</button>
            </CommerceForm>
          </details>
          <h2 className="text-xl font-semibold">{t("wishlist")}</h2>
          <p className="text-muted">{t("wishlistSoon")}</p>
          <h2 className="text-xl font-semibold">{t("privacy")}</h2>
          {customer.deletionRequestedAt ? (
            <p>{t("deletionPending")}</p>
          ) : (
            <CommerceForm action={deletionRequestAction.bind(null, locale)}>
              <p className="text-sm text-muted">{t("deletionExplanation")}</p>
              <button className="rounded-token border border-error px-4 py-3 text-error">
                {t("requestDeletion")}
              </button>
            </CommerceForm>
          )}
        </section>
      </div>
    </main>
  );
}
