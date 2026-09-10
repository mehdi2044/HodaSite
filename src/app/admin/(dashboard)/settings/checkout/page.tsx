import Link from "next/link";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { checkoutPolicyAction, guestPolicyAction } from "./actions";
export default async function CheckoutSettings() {
  await assertCan((await auth())?.user?.id ?? "", "markets.edit");
  const t = await getTranslations("commerce"),
    [markets, settings, pages] = await Promise.all([
      db.market.findMany(),
      db.siteSettings.findUniqueOrThrow({ where: { id: "default" } }),
      db.page.findMany({ where: { deletedAt: null, status: "PUBLISHED" } }),
    ]),
    config = settings.checkout as {
      guestCheckout?: boolean;
      termsPageId?: string;
    };
  return (
    <main className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t("checkoutSettings")}</h1>
      <Link className="underline" href="/admin/payments/banks">
        {t("bankAccounts")}
      </Link>
      <CommerceForm action={guestPolicyAction}>
        <label>
          <input
            type="checkbox"
            name="guestCheckout"
            defaultChecked={config.guestCheckout !== false}
          />{" "}
          {t("allowGuest")}
        </label>
        <label>
          {t("terms")}
          <select
            className="input ms-3"
            name="termsPageId"
            defaultValue={config.termsPageId ?? "seed-page-terms"}
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.titleI18n as Record<string, string>).fa}
              </option>
            ))}
          </select>
        </label>
        <button className="button w-fit">{t("save")}</button>
      </CommerceForm>
      <div className="grid gap-5 lg:grid-cols-3">
        {markets.map((m) => (
          <section className="rounded-token border p-5" key={m.id}>
            <h2 className="mb-5 text-xl font-semibold">{m.code}</h2>
            <CommerceForm action={checkoutPolicyAction}>
              <input type="hidden" name="marketId" value={m.id} />
              <label>
                {t("holdHours")}
                <input
                  className="input mt-2 w-full"
                  type="number"
                  name="holdHours"
                  min="1"
                  max="168"
                  defaultValue={m.holdHours}
                />
              </label>
              <label>
                {t("paymentHours")}
                <input
                  className="input mt-2 w-full"
                  type="number"
                  name="paymentDeadlineHours"
                  min="1"
                  max="720"
                  defaultValue={m.paymentDeadlineHours}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={m.paymentMethods.includes(
                    "OFFLINE_BANK_TRANSFER",
                  )}
                />{" "}
                {t("bankTransfer")}
              </label>
              <button className="button">{t("save")}</button>
            </CommerceForm>
          </section>
        ))}
      </div>
    </main>
  );
}
