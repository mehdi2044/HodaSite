import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentCustomer } from "@/modules/customers";
import { getRequestContext } from "@/lib/request-context";
import {
  preferences,
  privacyRequests,
  createUnsubscribeToken,
  channels,
} from "@/modules/crm";
import { EngagementForm } from "@/components/engagement/form";
import {
  preferenceAction,
  requestAction,
  cancelRequestAction,
} from "./actions";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function PreferencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations("crm"),
    actor = await currentCustomer();
  if (!actor) redirect(`/${locale}/account/login`);
  const { market } = await getRequestContext(locale),
    page = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000)
      .catch(0)
      .parse((await searchParams).page);
  const [rows, requests, token] = await Promise.all([
    preferences(market.id),
    privacyRequests(market.id, page),
    createUnsubscribeToken(market.id),
  ]);
  return (
    <main className="shell grid gap-6 py-10">
      <Link className="underline" href={`/${locale}/account`}>
        {t("account")}
      </Link>
      <h1>{t("preferences")}</h1>
      <p>{t("preferenceHelp")}</p>
      <p>
        {t("market")}: <bdi>{market.code}</bdi>
      </p>
      {/* Privacy choices must show authoritative server state after saving.
          A fresh document avoids retaining stale data in a streamed refresh. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {channels.map((channel) => {
          const row = rows.find((r) => r.channel === channel);
          return (
            <section className="card grid gap-3" key={channel}>
              <h2>{t(`channels.${channel}`)}</h2>
              <p>{t(`states.${row?.status ?? "UNKNOWN"}`)}</p>
              {row && (
                <time>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(row.updatedAt)}
                </time>
              )}
              <EngagementForm action={preferenceAction} refresh="document">
                <input type="hidden" name="marketId" value={market.id} />
                <input type="hidden" name="channel" value={channel} />
                <label>
                  {t("choice")}
                  <select
                    className="input w-full"
                    name="status"
                    defaultValue={row?.status ?? "OPTED_OUT"}
                  >
                    <option value="OPTED_OUT">{t("states.OPTED_OUT")}</option>
                    <option value="OPTED_IN">{t("states.OPTED_IN")}</option>
                  </select>
                </label>
                <button className="button">{t("save")}</button>
              </EngagementForm>
            </section>
          );
        })}
      </div>
      {token && (
        <Link
          prefetch={false}
          className="underline"
          href={`/${locale}/unsubscribe?token=${encodeURIComponent(token)}`}
        >
          {t("unsubscribe")}
        </Link>
      )}
      <section className="card grid gap-4">
        <h2>{t("privacy")}</h2>
        <p>{t("privacyHelp")}</p>
        {actor.deletionRequestedAt && <p>{t("legacyDeletion")}</p>}
        <EngagementForm action={requestAction} refresh="document">
          <input type="hidden" name="marketId" value={market.id} />
          <label>
            {t("requestType")}
            <select className="input w-full" name="kind">
              <option value="EXPORT">{t("kinds.EXPORT")}</option>
              <option value="DELETE">{t("kinds.DELETE")}</option>
            </select>
          </label>
          <button className="button">{t("request")}</button>
        </EngagementForm>
      </section>
      {!requests.length && <p>{t("empty")}</p>}
      {requests.slice(0, 25).map((r) => (
        <article className="card grid gap-3" key={r.id}>
          <h2>{t(`kinds.${r.kind}`)}</h2>
          <p>{t(`states.${r.status}`)}</p>
          {r.status === "APPROVED" && r.kind === "EXPORT" && (
            <>
              <a
                className="button"
                href={`/${locale}/account/preferences/export/${r.id}`}
              >
                {t("download")}
              </a>
              <p>{t("exportHelp")}</p>
            </>
          )}
          {["REQUESTED", "IN_REVIEW"].includes(r.status) && (
            <EngagementForm action={cancelRequestAction} refresh="document">
              <input type="hidden" name="marketId" value={market.id} />
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="version" value={r.version} />
              <button className="button">{t("cancel")}</button>
            </EngagementForm>
          )}
        </article>
      ))}
      <div className="flex gap-3">
        {page > 0 && (
          <Link className="button" href={`?page=${page - 1}`}>
            {t("previous")}
          </Link>
        )}
        {requests.length > 25 && (
          <Link className="button" href={`?page=${page + 1}`}>
            {t("next")}
          </Link>
        )}
      </div>
    </main>
  );
}
