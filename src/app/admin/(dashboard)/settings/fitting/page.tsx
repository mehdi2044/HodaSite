import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  fittingSettings,
  fittingRecipientMarkets,
  fittingRecipients,
} from "@/modules/fitting/settings";
import { FittingSettings } from "@/components/admin/fitting-settings";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; marketId?: string }>;
}) {
  const s = await auth();
  if (!s?.user?.id || !(await can(s.user.id, "ai.settings.manage")))
    redirect("/admin");
  const config = await fittingSettings();
  const t = await getTranslations("fitting");
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 100) ?? "";
  const grantMarkets = await fittingRecipientMarkets();
  const grantMarketId =
    query.marketId !== undefined
      ? (grantMarkets.find((m) => m.id === query.marketId)?.id ?? null)
      : (grantMarkets[0]?.id ?? null);
  const segmentAllowed = grantMarketId
    ? await can(s.user.id, "crm.segment.manage", { marketId: grantMarketId })
    : false;
  const [markets, customers, segments, media] = await Promise.all([
    db.market.findMany({ select: { id: true, code: true, currency: true } }),
    grantMarketId ? fittingRecipients(grantMarketId, q) : [],
    grantMarketId && segmentAllowed
      ? db.crmSegment.findMany({
          where: {
            marketId: grantMarketId,
          },
          select: { id: true, name: true, marketId: true },
          orderBy: { name: "asc" },
        })
      : [],
    db.media.findMany({
      where: { id: { in: config.config.models.map((m) => m.mediaId) } },
      select: { id: true, url: true },
    }),
  ]);
  return (
    <>
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label>
          {t("recipientMarket")}
          <select
            className="input"
            name="marketId"
            defaultValue={grantMarketId ?? ""}
            disabled={!grantMarkets.length}
          >
            <option value="">{t("none")}</option>
            {grantMarkets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.code}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input"
          name="q"
          defaultValue={q}
          aria-label={t("recipients")}
        />
        <button className="button">{t("customerSearch")}</button>
      </form>
      <FittingSettings
        key={grantMarketId ?? "none"}
        initial={config.config}
        version={config.integration}
        keyReady={config.keyReady}
        markets={markets}
        grantMarketId={grantMarketId}
        customers={customers.map((c) => ({
          id: c.id,
          label: `${c.firstName} ${c.lastName} · ${c.email}`,
        }))}
        segments={segments}
        mediaUrls={Object.fromEntries(media.map((m) => [m.id, m.url]))}
        review={config.review}
      />
    </>
  );
}
