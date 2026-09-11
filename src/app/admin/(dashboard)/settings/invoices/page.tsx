import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { invoiceMarkets } from "@/modules/orders/invoices/access";
import { invoiceSettingsSchema } from "@/modules/orders/invoices/document";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { saveInvoiceSettings } from "./actions";
export default async function InvoiceSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const visible = await invoiceMarkets(session.user.id, "markets.edit");
  const markets = await db.market.findMany({
    where: { id: { in: visible.map((m) => m.id) } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, invoiceSettings: true },
  });
  if (!markets.length) notFound();
  const t = await getTranslations("invoice");
  return (
    <main className="grid gap-7">
      <h1 className="text-2xl font-semibold">{t("settings")}</h1>
      {markets.map((m) => {
        const settings = invoiceSettingsSchema.parse(m.invoiceSettings);
        return (
          <section className="grid gap-4 rounded-token border p-6" key={m.id}>
            <h2 className="text-xl">{m.code}</h2>
            <CommerceForm action={saveInvoiceSettings}>
              <input type="hidden" name="marketId" value={m.id} />
              {(["Fa", "Tr", "En"] as const).map((locale) => (
                <label className="grid gap-2" key={locale}>
                  {t("taxLabel")} ({locale.toLowerCase()})
                  <input
                    className="input"
                    name={`taxLabel${locale}`}
                    defaultValue={settings[`taxLabel${locale}`]}
                    maxLength={150}
                  />
                </label>
              ))}
              <label className="grid gap-2">
                {t("taxId")}
                <input
                  className="input"
                  name="taxId"
                  defaultValue={settings.taxId}
                  maxLength={150}
                  dir="ltr"
                />
              </label>
              <button className="button justify-self-start">{t("save")}</button>
            </CommerceForm>
          </section>
        );
      })}
    </main>
  );
}
