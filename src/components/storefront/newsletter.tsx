import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { currentCustomer } from "@/modules/customers";
import { preferences } from "@/modules/crm";
import { EngagementForm } from "@/components/engagement/form";
import { preferenceAction } from "@/app/[locale]/account/preferences/actions";

/** Existing verified, market-specific consent. No sender or guest-email capture. */
export async function Newsletter({
  locale,
  marketId,
}: {
  locale: string;
  marketId: string;
}) {
  const t = await getTranslations("footer"),
    crm = await getTranslations("crm"),
    actor = await currentCustomer();
  const verified = Boolean(actor && !actor.isGuest);
  const email = verified
    ? (await preferences(marketId)).find((row) => row.channel === "email")
    : null;
  return (
    <section className="moda-newsletter">
      <h2>{t("newsletterTitle")}</h2>
      <p>{t("newsletterIntro")}</p>
      {verified ? (
        <>
          <p>{crm(`states.${email?.status ?? "UNKNOWN"}`)}</p>
          <EngagementForm action={preferenceAction} refresh="document">
            <input type="hidden" name="marketId" value={marketId} />
            <input type="hidden" name="channel" value="email" />
            <label>
              {crm("choice")}
              <select
                name="status"
                className="input"
                defaultValue={email?.status ?? "OPTED_OUT"}
              >
                <option value="OPTED_OUT">{crm("states.OPTED_OUT")}</option>
                <option value="OPTED_IN">{crm("states.OPTED_IN")}</option>
              </select>
            </label>
            <button className="button">{crm("save")}</button>
          </EngagementForm>
        </>
      ) : (
        <Link className="button" href={`/${locale}/account/preferences`}>
          {t("newsletterManage")}
        </Link>
      )}
    </section>
  );
}
