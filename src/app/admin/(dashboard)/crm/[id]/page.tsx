import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { z } from "zod";
import { customer360, channels } from "@/modules/crm";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { localized } from "@/lib/seo";
import { EngagementForm } from "@/components/engagement/form";
import { noteAction, tagsAction } from "../actions";
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ marketId?: string; page?: string }>;
}) {
  const { id } = await params,
    q = await searchParams,
    t = await getTranslations("crm"),
    commerce = await getTranslations("commerce"),
    returnsCopy = await getTranslations("returns"),
    locale = await getLocale(),
    page = z.coerce.number().int().min(0).max(1000).catch(0).parse(q.page);
  if (!q.marketId) notFound();
  try {
    const d = await customer360(q.marketId, id, page);
    const date = (v: Date) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(v);
    const hidden = (
      <>
        <input type="hidden" name="marketId" value={q.marketId} />
        <input type="hidden" name="customerId" value={id} />
      </>
    );
    const sections = {
      orders: d.orders.map((r) => ({
        id: r.id,
        text: `${r.number} · ${r.totalAmount} ${r.currency} · ${commerce(`statuses.${r.status}`)}`,
        date: r.placedAt,
      })),
      returns: d.returns.map((r) => ({
        id: r.id,
        text: returnsCopy(`statuses.${r.status}`),
        date: r.createdAt,
      })),
      wishlist: d.wishlist.map((r) => ({
        id: r.id,
        text: localized(r.product.titleI18n, locale),
        date: r.createdAt,
      })),
      carts: d.carts.map((r) => ({
        id: r.id,
        text: t(
          r.completedAt
            ? "cartCompleted"
            : r.expiresAt < new Date()
              ? "cartExpired"
              : "cartOpen",
          { count: r._count.items },
        ),
        date: r.updatedAt,
      })),
      reviews: d.reviews.map((r) => ({
        id: r.id,
        text: `${localized(r.product.titleI18n, locale)} · ${new Intl.NumberFormat(locale).format(r.rating)}/5`,
        date: r.createdAt,
      })),
    };
    return (
      <section className="grid gap-6 min-w-0">
        <Link className="underline" href={`/admin/crm?marketId=${q.marketId}`}>
          {t("customers")}
        </Link>
        <header>
          <h1>
            {[d.profile.firstName, d.profile.lastName].join(" ").trim() ||
              t("unnamed")}
          </h1>
          <p className="text-muted">{t("customerHelp")}</p>
        </header>
        <article className="card grid gap-2">
          <h2>{t("profile")}</h2>
          <p>
            {t("market")}: <bdi>{d.market.code}</bdi>
          </p>
          <bdi dir="ltr" className="break-all">
            {d.profile.email}
          </bdi>
          <bdi dir="ltr">{d.profile.phone}</bdi>
          <p>
            {t(`locales.${d.profile.locale}`)} · {date(d.profile.createdAt)}
          </p>
          {d.profile.deletionRequestedAt && <p>{t("legacyDeletion")}</p>}
        </article>
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["orders", new Intl.NumberFormat(locale).format(d.metrics.orders)],
            ["historicalClv", d.metrics.historicalClvUsd + " USD"],
            ["aov", d.metrics.aovUsd + " USD"],
            ["rfm", d.metrics.rfm?.join(" / ") ?? t("unclassified")],
          ].map(([label, value]) => (
            <article className="card" key={label}>
              <h2>{t(label)}</h2>
              <bdi dir="ltr">{value}</bdi>
            </article>
          ))}
        </section>
        <p>{t("metricDefinition")}</p>
        <p>
          {t("churn")}: {t(d.metrics.churn)}
        </p>
        <p className="text-muted">{t("sessionsHelp")}</p>
        <section className="card grid gap-4">
          <h2>{t("tags")}</h2>
          <p>{d.tags.join(" · ") || t("empty")}</p>
          {d.access.tags && (
            <EngagementForm action={tagsAction}>
              {hidden}
              <label>
                {t("tagsHelp")}
                <input
                  className="input w-full"
                  name="tags"
                  defaultValue={d.tags.join(", ")}
                  maxLength={1800}
                />
              </label>
              <button className="button">{t("save")}</button>
            </EngagementForm>
          )}
        </section>
        {d.access.notes && (
          <section className="card grid gap-4">
            <h2>{t("notes")}</h2>
            {d.notes.slice(0, 25).map((n) => (
              <p className="whitespace-pre-wrap" key={n.id}>
                {n.body}
                <small className="block text-muted">{date(n.createdAt)}</small>
              </p>
            ))}
            <EngagementForm action={noteAction}>
              {hidden}
              <label>
                {t("noteHelp")}
                <textarea
                  className="input w-full"
                  name="body"
                  required
                  maxLength={2000}
                />
              </label>
              <button className="button">{t("addNote")}</button>
            </EngagementForm>
          </section>
        )}
        <section className="card grid gap-3">
          <h2>{t("consent")}</h2>
          {channels.map((c) => (
            <p key={c}>
              {t(`channels.${c}`)}:{" "}
              {t(
                `states.${d.consents.find((x) => x.channel === c)?.status ?? "UNKNOWN"}`,
              )}
            </p>
          ))}
          <details>
            <summary className="cursor-pointer min-h-11">
              {t("consentHistory")}
            </summary>
            <ol className="grid gap-3">
              {d.consentHistory.slice(0, 25).map((e) => (
                <li key={e.id}>
                  {t(`channels.${e.channel}`)} · {t(`states.${e.status}`)} ·{" "}
                  {t(`sources.${e.source}`)}
                  <time className="block text-muted">{date(e.createdAt)}</time>
                </li>
              ))}
            </ol>
          </details>
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
          {Object.entries(sections).map(([key, rows]) => (
            <section className="card grid gap-3" key={key}>
              <h2>{t(key)}</h2>
              {!rows.length && <p>{t("empty")}</p>}
              {rows.slice(0, 25).map((r) => (
                <p key={r.id}>
                  <bdi>{r.text}</bdi>
                  <time className="block text-muted">{date(r.date)}</time>
                </p>
              ))}
            </section>
          ))}
        </div>
        <section className="card">
          <h2>{t("timeline")}</h2>
          {!d.timeline.length && <p>{t("empty")}</p>}
          <ol className="grid gap-4 mt-4">
            {d.timeline.slice(0, 25).map((r) => (
              <li key={r.kind + r.id}>
                {t(r.kind)} · {date(r.at)}
              </li>
            ))}
          </ol>
        </section>
        <div className="flex gap-3">
          {page > 0 && (
            <Link
              className="button"
              href={`?marketId=${q.marketId}&page=${page - 1}`}
            >
              {t("previous")}
            </Link>
          )}
          {d.next && (
            <Link
              className="button"
              href={`?marketId=${q.marketId}&page=${page + 1}`}
            >
              {t("next")}
            </Link>
          )}
        </div>
      </section>
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/admin/login");
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}
