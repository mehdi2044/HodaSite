import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import type { Market } from "@/lib/request-context";
import type { EditorialLocale } from "@/modules/editorial/contracts";
import { publishedEntries } from "@/modules/editorial/queries";
import { WeeklyEditorial } from "./weekly-editorial";

export async function EditorialHome({
  locale,
  market,
}: {
  locale: EditorialLocale;
  market: Market;
}) {
  const [looks, articles] = await Promise.all([
    publishedEntries("LOOK", market.id),
    publishedEntries("ARTICLE", market.id),
  ]);
  if (!looks.length && !articles.length) return null;
  const t = await getTranslations({ locale, namespace: "editorial" });
  return (
    <section className="shell editorial-home editorial-section">
      <nav className="editorial-link-row" aria-label={t("browse")}>
        <Link className="button" href={seoPath(locale, market.code, "looks")}>
          {t("gallery")}
        </Link>
        <Link
          className="button"
          href={seoPath(locale, market.code, "magazine")}
        >
          {t("magazine")}
        </Link>
      </nav>
      <WeeklyEditorial locale={locale} market={market} compact />
    </section>
  );
}
