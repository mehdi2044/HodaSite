import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { z } from "zod";
import { visibleCrmMarkets } from "@/modules/crm";
import { auth } from "@/modules/auth";
import { can, ForbiddenError, UnauthorizedError } from "@/modules/access";
import {
  listPromotionPrograms,
  promotionEditorData,
  listPromotionCoupons,
  promotionHistory,
  promotionSampleCarts,
  PromotionError,
} from "@/modules/promotions/server";
import { promotionRevisionSchema } from "@/modules/promotions";
import { localized } from "@/lib/seo";
import { Iso } from "@/components/storefront/iso";
import { PromotionEditor } from "@/components/promotions/editor";
import { CouponIssuer, CouponStatus } from "@/components/promotions/coupons";
import { PromotionSimulator } from "@/components/promotions/simulator";
export const dynamic = "force-dynamic";
const copy = z.object({ fa: z.string(), tr: z.string(), en: z.string() });
export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams,
    t = await getTranslations("promotionAdmin"),
    locale = await getLocale();
  const pageNumber = (k: string) =>
    z.coerce.number().int().min(0).max(1000).catch(0).parse(q[k]);
  try {
    const markets = await visibleCrmMarkets("pricing.sale_price.edit");
    if (
      !markets.length ||
      (q.marketId && !markets.some((m) => m.id === q.marketId))
    )
      notFound();
    const marketId = q.marketId ?? markets[0].id,
      page = pageNumber("page"),
      couponPage = pageNumber("couponPage"),
      historyPage = pageNumber("historyPage"),
      cartPage = pageNumber("cartPage");
    const programs = await listPromotionPrograms(marketId, page);
    const editing = Boolean(q.id) || q.new === "1";
    const data = editing ? await promotionEditorData(marketId, q.id) : null;
    const saved = data?.saved;
    const actor = (await auth())!.user.id;
    const simulationAllowed =
      Boolean(saved) &&
      (await can(actor, "crm.customer.view", { marketId })) &&
      (await can(actor, "crm.segment.manage", { marketId }));
    const [coupons, history, carts] = await Promise.all([
      saved ? listPromotionCoupons(marketId, saved.id, couponPage) : [],
      saved ? promotionHistory(marketId, saved.id, historyPage) : [],
      simulationAllowed ? promotionSampleCarts(marketId, cartPage) : [],
    ]);
    const query = new URLSearchParams({
      marketId,
      ...(q.id ? { id: q.id } : {}),
      page: String(page),
      couponPage: String(couponPage),
      historyPage: String(historyPage),
      cartPage: String(cartPage),
    });
    const pagination = (key: string, current: number, count: number) => (
      <div className="flex flex-wrap gap-3">
        {[...(current > 0 ? [-1] : []), ...(count > 25 ? [1] : [])].map(
          (delta) => {
            const next = new URLSearchParams(query);
            next.set(key, String(current + delta));
            return (
              <Link className="button" key={delta} href={`?${next}`}>
                {t(delta < 0 ? "previous" : "next")}
              </Link>
            );
          },
        )}
      </div>
    );
    return (
      <section className="grid gap-6 min-w-0" data-testid="promotion-admin">
        <header>
          <h1>{t("title")}</h1>
          <p className="text-muted">{t("intro")}</p>
        </header>
        <form method="get" className="flex flex-wrap gap-3 items-end">
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
          <button className="button">{t("filter")}</button>
          <Link className="button" href={`?marketId=${marketId}&new=1`}>
            {t("newProgram")}
          </Link>
        </form>
        {editing && data ? (
          <>
            <Link
              href={`?marketId=${marketId}`}
              className="button justify-self-start"
            >
              {t("back")}
            </Link>
            <h2>{saved ? saved.name : t("newProgram")}</h2>
            {saved && (
              <p>
                {t("revision", { version: saved.version })} ·{" "}
                <Iso>{data.currency}</Iso>
              </p>
            )}
            <PromotionEditor
              key={`${marketId}-${saved?.id ?? "new"}-${saved?.version ?? 0}`}
              marketId={marketId}
              currency={data.currency}
              now={new Date().toISOString()}
              segmentAllowed={data.segmentAllowed}
              options={{
                product: data.products.map((p) => ({
                  id: p.id,
                  name: localized(p.titleI18n, locale),
                })),
                category: data.categories.map((p) => ({
                  id: p.id,
                  name: localized(p.titleI18n, locale),
                })),
                collection: data.collections.map((p) => ({
                  id: p.id,
                  name: localized(p.titleI18n, locale),
                })),
                segment: data.segments,
                program: data.programs,
              }}
              saved={
                saved
                  ? {
                      ...saved,
                      titleI18n: copy.parse(saved.titleI18n),
                      descriptionI18n: copy.parse(saved.descriptionI18n),
                    }
                  : undefined
              }
            />
            {saved && (
              <>
                <section className="card grid gap-4">
                  <h2>{t("coupons")}</h2>
                  {saved.config.couponRequired &&
                  saved.config.status !== "ARCHIVED" ? (
                    <CouponIssuer
                      marketId={marketId}
                      programId={saved.id}
                      now={new Date().toISOString()}
                    />
                  ) : (
                    <p>{t("couponDisabled")}</p>
                  )}
                  {!coupons.length && <p>{t("empty")}</p>}
                  {coupons.slice(0, 25).map((c) => (
                    <details
                      className="rounded-token border p-4 min-w-0"
                      key={`${c.id}-${c.version}`}
                    >
                      <summary className="min-h-11 cursor-pointer break-all">
                        <Iso>{c.code}</Iso> · {t(`statusOptions.${c.status}`)}
                      </summary>
                      <p>
                        {t("couponCaps", {
                          total: c.totalUsageCap ?? t("unlimited"),
                          customer: c.perCustomerCap ?? t("unlimited"),
                        })}
                      </p>
                      <p>
                        {t("startsAt")}: <Iso>{c.startsAt.toISOString()}</Iso>
                      </p>
                      {c.endsAt && (
                        <p>
                          {t("endsAt")}: <Iso>{c.endsAt.toISOString()}</Iso>
                        </p>
                      )}
                      <CouponStatus
                        marketId={marketId}
                        id={c.id}
                        version={c.version}
                        status={c.status}
                      />
                    </details>
                  ))}
                  {pagination("couponPage", couponPage, coupons.length)}
                </section>
                {simulationAllowed ? (
                  <>
                    <PromotionSimulator
                      key={`${saved.id}-${saved.version}-${cartPage}`}
                      marketId={marketId}
                      programId={saved.id}
                      names={Object.fromEntries(
                        [
                          ...data.programs,
                          { id: saved.id, name: saved.name },
                        ].map((p) => [p.id, p.name]),
                      )}
                      carts={carts.slice(0, 25).map((c) => ({
                        id: c.id,
                        label: `${c.customer ? [c.customer.firstName, c.customer.lastName].join(" ") : t("guest")} · ${t(`locales.${c.locale in { fa: 1, tr: 1, en: 1 } ? c.locale : "en"}`)} · ${t("cartItems", { count: c._count.items })} · ${new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(c.createdAt)}`,
                      }))}
                    />
                    {pagination("cartPage", cartPage, carts.length)}
                  </>
                ) : (
                  <p className="card">{t("simulationPermission")}</p>
                )}
                <section className="card grid gap-4">
                  <h2>{t("history")}</h2>
                  {history.slice(0, 25).map((r) => (
                    <article className="border-b pb-3" key={r.version}>
                      <strong>
                        {t("revision", { version: r.version })}: {r.name}
                      </strong>
                      <p>
                        {t(
                          `statusOptions.${promotionRevisionSchema.parse(r.config).status}`,
                        )}{" "}
                        ·{" "}
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "UTC",
                        }).format(r.createdAt)}
                      </p>
                    </article>
                  ))}
                  {pagination("historyPage", historyPage, history.length)}
                </section>
              </>
            )}
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {!programs.length && <p className="card">{t("empty")}</p>}
              {programs.slice(0, 25).map((p) => {
                const r = p.revisions[0],
                  c = promotionRevisionSchema.parse(r.config);
                return (
                  <Link
                    className="card grid gap-3 min-w-0"
                    key={p.id}
                    href={`?marketId=${marketId}&id=${p.id}`}
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="break-words">{r.name}</h2>
                      <span>{t(`statusOptions.${c.status}`)}</span>
                    </div>
                    <p>
                      {t(`effects.${c.definition.effect.type}`)} ·{" "}
                      <Iso>{p.currency}</Iso>
                    </p>
                    <p className="text-muted">
                      {t("revision", { version: p.version })} ·{" "}
                      {t(c.enabled ? "enabled" : "disabled")}
                    </p>
                  </Link>
                );
              })}
            </div>
            {pagination("page", page, programs.length)}
          </>
        )}
      </section>
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/admin/login");
    if (
      e instanceof ForbiddenError ||
      (e instanceof PromotionError && e.code === "NOT_FOUND")
    )
      notFound();
    throw e;
  }
}
