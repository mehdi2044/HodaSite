import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { bankAccountAction } from "../../orders/actions";
export default async function BankPage() {
  const userId = (await auth())?.user?.id ?? "",
    t = await getTranslations("commerce"),
    all = await db.market.findMany({ include: { bankAccounts: true } }),
    markets = [];
  for (const m of all)
    if (await can(userId, "markets.edit", { marketId: m.id })) markets.push(m);
  return (
    <main className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t("bankAccounts")}</h1>
      {markets.map((m) => (
        <section key={m.id} className="rounded-token border p-5">
          <h2 className="mb-5 text-xl">{m.code}</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {[...m.bankAccounts, null].map((b, i) => (
              <CommerceForm action={bankAccountAction} key={b?.id ?? i}>
                <input type="hidden" name="marketId" value={m.id} />
                {b && <input type="hidden" name="id" value={b.id} />}
                <h3 className="font-semibold">{b ? b.label : t("addBank")}</h3>
                {[
                  "label",
                  "bankName",
                  "holder",
                  "accountNumber",
                  "iban",
                  "cardNumber",
                ].map((k) => (
                  <label key={k}>
                    {t(k)}
                    <input
                      className="input mt-2 w-full"
                      name={k}
                      defaultValue={
                        b ? (b as unknown as Record<string, string>)[k] : ""
                      }
                      required={["label", "bankName", "holder"].includes(k)}
                    />
                  </label>
                ))}
                {["fa", "tr", "en"].map((l) => (
                  <label key={l}>
                    {t("bankInstructions")} ({l})
                    <textarea
                      className="input w-full"
                      name={`instructions${l[0].toUpperCase()}${l.slice(1)}`}
                      defaultValue={
                        (
                          b?.instructionsI18n as
                            Record<string, string> | undefined
                        )?.[l] ?? ""
                      }
                    />
                  </label>
                ))}
                <label>
                  {t("sortOrder")}
                  <input
                    className="input"
                    name="sortOrder"
                    type="number"
                    min="0"
                    max="10000"
                    defaultValue={b?.sortOrder ?? 0}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={b?.isActive ?? true}
                  />{" "}
                  {t("active")}
                </label>
                <button className="button">{t("save")}</button>
              </CommerceForm>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
