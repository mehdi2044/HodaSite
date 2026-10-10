import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { fittingSettings } from "@/modules/fitting";
import { FittingSettings } from "@/components/admin/fitting-settings";
export default async function Page() {
  const s = await auth();
  if (!s?.user?.id || !(await can(s.user.id, "ai.settings.manage")))
    redirect("/admin");
  const config = await fittingSettings(),
    grantAllowed = await can(s.user.id, "crm.customer.view");
  const [markets, customers, segments, media] = await Promise.all([
    db.market.findMany({ select: { id: true, code: true, currency: true } }),
    grantAllowed
      ? db.customer.findMany({
          where: { isActive: true, isGuest: false },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
    grantAllowed
      ? db.crmSegment.findMany({
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
  );
}
