import { getTranslations } from "next-intl/server";
import { readUnsubscribeToken } from "@/modules/crm";
import { EngagementForm } from "@/components/engagement/form";
import { unsubscribeAction } from "../account/preferences/actions";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token,
    t = await getTranslations("crm");
  try {
    readUnsubscribeToken(token);
  } catch {
    return (
      <main className="shell py-10">
        <p role="alert">{t("invalidLink")}</p>
      </main>
    );
  }
  return (
    <main className="shell py-10">
      <section className="card grid gap-4">
        <h1>{t("unsubscribe")}</h1>
        <p>{t("unsubscribeHelp")}</p>
        <EngagementForm action={unsubscribeAction} refresh={false}>
          <input type="hidden" name="token" value={token} />
          <button className="button">{t("confirmUnsubscribe")}</button>
        </EngagementForm>
      </section>
    </main>
  );
}
