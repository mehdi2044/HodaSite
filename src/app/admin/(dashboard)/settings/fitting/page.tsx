import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { fittingSettings } from "@/modules/fitting";
import { FittingSettings } from "@/components/admin/fitting-settings";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const s = await auth();
  if (!s?.user?.id || !(await can(s.user.id, "ai.settings.manage")))
    redirect("/admin");
  const config = await fittingSettings(),
    grantAllowed = await can(s.user.id, "crm.customer.view");
  const t = await getTranslations("fitting");
  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const allMarkets = await db.market.findMany({ select: { id: true } });
  const segmentAccess = await Promise.all(
    allMarkets.map(async (m) =>
      (await can(s.user.id, "crm.segment.manage", { marketId: m.id }))
        ? m.id
        : null,
    ),
  );
  const [markets, customers, segments, media] = await Promise.all([
    db.market.findMany({ select: { id: true, code: true, currency: true } }),
    grantAllowed
      ? db.customer.findMany({
          where: {
            isActive: true,
            isGuest: false,
            ...(q
              ? {
                  OR: [
                    { email: { contains: q, mode: "insensitive" as const } },
                    {
                      firstName: { contains: q, mode: "insensitive" as const },
                    },
                    { lastName: { contains: q, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
    grantAllowed
      ? db.crmSegment.findMany({
          where: {
            marketId: { in: segmentAccess.filter((id): id is string => !!id) },
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
      <form className="mb-6 flex gap-3">
        <input
          className="input"
          name="q"
          defaultValue={q}
          aria-label={t("recipients")}
        />
        <button className="button">{t("customerSearch")}</button>
      </form>
      <FittingSettings
        key={config.integration ?? "new"}
        initial={config.config}
        version={config.integration}
        keyReady={config.keyReady}
        markets={markets}
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
