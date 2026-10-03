import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { localized } from "@/lib/seo";
import { UnauthorizedError, ForbiddenError } from "@/modules/access";
import {
  visibleCrmMarkets,
  listCustomers,
  listSegments,
  privacyRequests,
  getMetricsConfig,
  metricsSchema,
  segmentSchema,
} from "@/modules/crm";
import { EngagementForm } from "@/components/engagement/form";
import { SegmentBuilder } from "@/components/crm/segment-builder";
import { segmentAction, privacyAction, metricsAction } from "./actions";
import { segmentPreviewAction } from "./preview-action";
import { z } from "zod";

export const dynamic = "force-dynamic";
const permissions = {
  customers: "crm.customer.view",
  segments: "crm.segment.manage",
  privacy: "crm.privacy.review",
  metrics: "crm.metrics.manage",
};
export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams,
    t = await getTranslations("crm"),
    locale = await getLocale();
  const tab = z
    .enum(["customers", "segments", "privacy", "metrics"])
    .catch("customers")
    .parse(q.tab);
  const page = z.coerce.number().int().min(0).max(1000).catch(0).parse(q.page);
  try {
    const groups = await Promise.all(
      Object.entries(permissions).map(async ([key, p]) => ({
        key,
        markets: await visibleCrmMarkets(p),
      })),
    );
    const markets = groups.find((g) => g.key === tab)!.markets;
    if (!markets.length) {
      const first = groups.find((g) => g.markets.length);
      if (!first) notFound();
      redirect(`/admin/crm?tab=${first.key}`);
    }
    const marketId =
      markets.find((m) => m.id === q.marketId)?.id ?? markets[0].id;
    const search = (q.search ?? "").slice(0, 100);
    const query = new URLSearchParams({ tab, marketId });
    if (tab === "customers" && search) query.set("search", search);
    const customers =
      tab === "customers" ? await listCustomers(marketId, page, search) : [];
    const segments =
      tab === "segments" ? await listSegments(marketId, page) : [];
    const requests =
      tab === "privacy" ? await privacyRequests(marketId, page, true) : [];
    const config =
      tab === "metrics"
        ? metricsSchema.safeParse(
            (await getMetricsConfig(marketId))?.definition,
          )
        : null;
    const categories =
      tab === "segments"
        ? (
            await db.category.findMany({
              where: { deletedAt: null },
              select: { id: true, titleI18n: true },
              take: 1000,
            })
          ).map((c) => ({ id: c.id, name: localized(c.titleI18n, locale) }))
        : [];
    return (
      <section className="grid gap-6 min-w-0" data-testid="crm-hub">
        <header>
          <h1>{t("title")}</h1>
          <p className="text-muted">{t("intro")}</p>
        </header>
        <nav className="flex flex-wrap gap-3" aria-label={t("title")}>
          {groups
            .filter((g) => g.markets.length)
            .map((g) => (
              <Link
                className="button"
                aria-current={tab === g.key ? "page" : undefined}
                href={`/admin/crm?tab=${g.key}&marketId=${marketId}`}
                key={g.key}
              >
                {t(g.key)}
              </Link>
            ))}
        </nav>
        <form className="flex flex-wrap gap-3 items-end" method="get">
          <input type="hidden" name="tab" value={tab} />
          <label>
            {t("market")}
            <select
              className="input w-full"
              name="marketId"
              defaultValue={marketId}
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>
          </label>
          {tab === "customers" && (
            <label>
              {t("search")}
              <input
                className="input w-full"
                name="search"
                maxLength={100}
                defaultValue={search}
              />
            </label>
          )}
          <button className="button">{t("filter")}</button>
        </form>
        {tab === "customers" && (
          <div className="grid gap-3">
            {!customers.length && <p className="card">{t("empty")}</p>}
            {customers.slice(0, 25).map((c) => (
              <Link
                className="card flex flex-wrap justify-between gap-3"
                key={c.id}
                href={`/admin/crm/${c.id}?marketId=${marketId}`}
              >
                <strong>
                  {[c.firstName, c.lastName].join(" ").trim() || t("unnamed")}
                </strong>
                <span>
                  {t(
                    `locales.${c.locale in { fa: 1, tr: 1, en: 1 } ? c.locale : "en"}`,
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
        {tab === "segments" && (
          <>
            <section className="card grid gap-4">
              <h2>{t("newSegment")}</h2>
              <SegmentBuilder
                marketId={marketId}
                marketLabel={markets.find((m) => m.id === marketId)?.code ?? ""}
                categories={categories}
                action={segmentAction}
                previewAction={segmentPreviewAction}
              />
            </section>
            {!segments.length && <p>{t("empty")}</p>}
            {segments.slice(0, 25).map((s) => (
              <details className="card" key={`${s.id}-${s.version}`}>
                <summary className="min-h-11 cursor-pointer font-semibold">
                  {s.name} · {t("revision", { version: s.version })}
                </summary>
                <SegmentBuilder
                  marketId={marketId}
                  marketLabel={
                    markets.find((m) => m.id === marketId)?.code ?? ""
                  }
                  categories={categories}
                  saved={{
                    ...s,
                    definition: segmentSchema.parse(s.definition),
                  }}
                  action={segmentAction}
                  previewAction={segmentPreviewAction}
                />
              </details>
            ))}
          </>
        )}
        {tab === "privacy" && (
          <>
            <p className="card">{t("privacyHelp")}</p>
            {!requests.length && <p>{t("empty")}</p>}
            {requests.slice(0, 25).map((r) => (
              <article className="card grid gap-3" key={r.id}>
                <h2>{t(`kinds.${r.kind}`)}</h2>
                <p>
                  {[r.customer.firstName, r.customer.lastName]
                    .join(" ")
                    .trim() || t("unnamed")}
                </p>
                <bdi className="break-all" dir="ltr">
                  {r.id}
                </bdi>
                <p>{t(`states.${r.status}`)}</p>
                <time>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(r.createdAt)}
                </time>
                <ol>
                  {r.events.map((e) => (
                    <li key={e.id}>
                      {t(`states.${e.status}`)} ·{" "}
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(e.createdAt)}
                    </li>
                  ))}
                </ol>
                {["REQUESTED", "IN_REVIEW"].includes(r.status) && (
                  <EngagementForm action={privacyAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="marketId" value={marketId} />
                    <input type="hidden" name="version" value={r.version} />
                    <label>
                      {t("decision")}
                      <select className="input w-full" name="status">
                        {(r.status === "REQUESTED"
                          ? ["IN_REVIEW"]
                          : ["APPROVED", "REJECTED"]
                        ).map((s) => (
                          <option key={s} value={s}>
                            {t(`states.${s}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button">{t("save")}</button>
                  </EngagementForm>
                )}
              </article>
            ))}
          </>
        )}
        {tab === "metrics" && (
          <section className="card grid gap-4">
            <h2>{t("metrics")}</h2>
            <p>{t("metricsHelp")}</p>
            <p className="text-muted">{t("metricsExample")}</p>
            <EngagementForm action={metricsAction}>
              <input type="hidden" name="marketId" value={marketId} />
              {[
                "name",
                "recencyDays",
                "frequency",
                "monetaryUsd",
                "churnDays",
              ].map((key) => (
                <label key={key}>
                  {t(key)}
                  <input
                    className="input w-full"
                    name={key}
                    required
                    maxLength={120}
                    defaultValue={
                      config?.success
                        ? String(config.data[key as keyof typeof config.data])
                        : ""
                    }
                  />
                </label>
              ))}
              <button className="button">{t("save")}</button>
            </EngagementForm>
          </section>
        )}
        <div className="flex gap-3">
          {page > 0 && (
            <Link className="button" href={`?${query}&page=${page - 1}`}>
              {t("previous")}
            </Link>
          )}
          {[customers, segments, requests].some((xs) => xs.length > 25) && (
            <Link className="button" href={`?${query}&page=${page + 1}`}>
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
