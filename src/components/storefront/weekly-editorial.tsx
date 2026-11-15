import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import type { Market } from "@/lib/request-context";
import type { EditorialLocale } from "@/modules/editorial/contracts";
import { weeklyLooks } from "@/modules/editorial/weekly";
import { readyImages } from "@/modules/editorial/queries";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { CuratedCard } from "./curated-card";

export async function WeeklyEditorial({
  locale,
  market,
  archive = false,
  compact = false,
}: {
  locale: EditorialLocale;
  market: Market;
  archive?: boolean;
  compact?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "editorial" });
  const rows = (await weeklyLooks(market.id, archive)).filter(
    ({ row }) => !compact || row.slot === "MAIN",
  );
  const [commerce, images] = await Promise.all([
    resolveLookCommerce(
      rows.map(({ look }) => look.body),
      market,
      locale,
    ),
    readyImages(
      rows.flatMap(({ look }) => [
        look.body.mediaId,
        look.body.mobileMediaId ?? look.body.mediaId,
      ]),
    ),
  ]);
  return (
    <section className="editorial-section">
      <h2>{t(archive ? "weeklyArchive" : "weekly")}</h2>
      {rows.length ? (
        <div className="editorial-grid">
          {rows.map(({ row, look }, index) => (
            <CuratedCard
              key={row.id}
              look={look}
              locale={locale}
              market={market}
              images={images}
              commerce={commerce[index]}
              weekly={!archive}
            />
          ))}
        </div>
      ) : (
        <p>{t("weeklyEmpty")}</p>
      )}
      {!archive && (
        <Link
          href={seoPath(locale, market.code, "magazine") + "?archive=weekly"}
        >
          {t("weeklyArchive")}
        </Link>
      )}
    </section>
  );
}
