import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import type { Market } from "@/lib/request-context";
import type { EditorialLocale } from "@/modules/editorial/contracts";
import { weeklyLooks } from "@/modules/editorial/weekly";
import { editorialSlug, publishedEntries } from "@/modules/editorial/queries";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { supportsLookFitting } from "@/modules/editorial/fitting";
import { CuratedCard } from "./curated-card";

export async function WeeklyEditorial({
  locale,
  market,
  archive = false,
  compact = false,
  gallery = false,
  magazine = false,
}: {
  locale: EditorialLocale;
  market: Market;
  archive?: boolean;
  compact?: boolean;
  gallery?: boolean;
  magazine?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "editorial" });
  const rows = (await weeklyLooks(market.id, archive)).filter(
    ({ row }) => !compact || row.slot === "MAIN",
  );
  if (!rows.length && (gallery || magazine)) return null;
  const [commerce, articles, fitting] = await Promise.all([
    resolveLookCommerce(
      rows.map(({ look }) => look.body),
      market,
      locale,
    ),
    gallery ? publishedEntries("ARTICLE", market.id) : [],
    Promise.all(rows.map(({ look }) => supportsLookFitting(look.body))),
  ]);
  return (
    <section
      className={`editorial-section${gallery ? " gallery-weekly" : ""}${magazine ? " magazine-weekly" : ""}`}
    >
      {archive && <h2>{t("weeklyArchive")}</h2>}
      {rows.length ? (
        <div className="editorial-grid">
          {rows.map(({ row, look }, index) => {
            const related = articles.find(
              ({ body }) =>
                body.kind === "ARTICLE" &&
                body.blocks.some(
                  (block) => block.type === "LOOK" && block.id === look.id,
                ),
            );
            return (
              <CuratedCard
                key={row.id}
                fitting={fitting[index]}
                t={t}
                look={look}
                locale={locale}
                market={market}
                articleHref={
                  related
                    ? seoPath(
                        locale,
                        market.code,
                        "magazine",
                        editorialSlug(related, locale),
                      )
                    : undefined
                }
                commerce={commerce[index]}
                weekly={!archive}
                wide={gallery}
              />
            );
          })}
        </div>
      ) : (
        <p>{t("weeklyEmpty")}</p>
      )}
      {!archive && !gallery && !magazine && (
        <Link
          href={seoPath(locale, market.code, "magazine") + "?archive=weekly"}
        >
          {t("weeklyArchive")}
        </Link>
      )}
    </section>
  );
}
