import { redirect, notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { db } from "@/lib/db";
import { returnMarkets } from "@/modules/returns/service";
import {
  servicePolicySchema,
  SERVICE_KEYS,
} from "@/modules/content/service-policy";
import { catalogText } from "@/modules/catalog";
import { SettingsForm } from "@/components/admin/settings-form";
import { savePolicy } from "./actions";
export default async function Policies() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const allowed = await returnMarkets(session.user.id, "markets.edit");
  if (!allowed.length) notFound();
  const locale = (await getLocale()) as "fa" | "tr" | "en",
    t = await getTranslations("modaAdmin");
  const [markets, rules, pages] = await Promise.all([
    db.market.findMany({
      where: { id: { in: allowed } },
      orderBy: { code: "asc" },
    }),
    db.feeRule.findMany({
      where: { marketId: { in: allowed }, type: "SHIPPING" },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    }),
    db.page.findMany({
      where: {
        status: "published",
        deletedAt: null,
        OR: [
          { marketIds: { isEmpty: true } },
          { marketIds: { hasSome: allowed } },
        ],
      },
      select: { id: true, titleI18n: true, marketIds: true },
    }),
  ]);
  return (
    <main className="grid gap-5">
      <h1 className="text-2xl font-semibold">{t("servicePolicyTitle")}</h1>
      <p>{t("servicePolicyHelp")}</p>
      {markets.map((market) => {
        const parsed = servicePolicySchema.safeParse(market.servicePolicy),
          policy = parsed.success ? parsed.data : null;
        return (
          <section
            className="card grid gap-3"
            key={`${market.id}:${policy?.revision ?? 0}`}
          >
            <h2>{market.code}</h2>
            <SettingsForm action={savePolicy} submitLabel={t("save")}>
              <input type="hidden" name="marketId" value={market.id} />
              <input
                type="hidden"
                name="revision"
                value={policy?.revision ?? 0}
              />
              <label>
                <input
                  type="checkbox"
                  name="announcement"
                  defaultChecked={policy?.announcement ?? false}
                />
                {t("policyAnnouncement")}
              </label>
              <label>
                {t("faqPage")}
                <select
                  className="input"
                  name="faqPageId"
                  defaultValue={policy?.faqPageId ?? ""}
                >
                  <option value="">{t("none")}</option>
                  {pages
                    .filter(
                      (page) =>
                        page.marketIds.length === 0 ||
                        page.marketIds.includes(market.id),
                    )
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {catalogText(page.titleI18n, locale)}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset>
                <legend>{t("policyShippingRules")}</legend>
                {rules
                  .filter((rule) => rule.marketId === market.id)
                  .map((rule) => (
                    <label key={rule.id} className="block min-h-11">
                      <input
                        type="checkbox"
                        name="shippingRuleId"
                        value={rule.id}
                        defaultChecked={
                          policy?.shippingRuleIds.includes(rule.id) ?? false
                        }
                      />{" "}
                      {catalogText(rule.labelI18n, locale)}
                    </label>
                  ))}
              </fieldset>
              {SERVICE_KEYS.map((key) => (
                <fieldset key={key} className="grid gap-2">
                  <legend>{t(`service_${key}`)}</legend>
                  {(["fa", "tr", "en"] as const).map((locale) => (
                    <div key={locale} className="grid gap-2 sm:grid-cols-2">
                      <label>
                        {t("title")} ({locale})
                        <input
                          className="input"
                          name={`${key}Title_${locale}`}
                          defaultValue={policy?.[key].title[locale] ?? ""}
                        />
                      </label>
                      <label>
                        {t("body")} ({locale})
                        <textarea
                          className="input"
                          name={`${key}Body_${locale}`}
                          defaultValue={policy?.[key].body[locale] ?? ""}
                        />
                      </label>
                    </div>
                  ))}
                </fieldset>
              ))}
              <div className="flex flex-wrap gap-2">
                <a className="button button-outline" href="/admin/pricing/fees">
                  {t("editFeeRules")}
                </a>
                <a
                  className="button button-outline"
                  href="/admin/returns/settings"
                >
                  {t("editReturns")}
                </a>
              </div>
            </SettingsForm>
          </section>
        );
      })}
    </main>
  );
}
