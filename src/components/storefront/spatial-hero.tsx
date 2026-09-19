import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import { storefrontHref } from "@/modules/content/storefront-links";
import { localizedValue, type HomepageBlock } from "@/modules/content/homepage";
import { type ResponsiveImageMedia } from "./responsive-image";
import { SpatialHeroView } from "./spatial-hero-view";
type Locale = "fa" | "tr" | "en";
export type HeroDepartment = {
  id: string;
  titleI18n: unknown;
  slugI18n: unknown;
  media:
    (ResponsiveImageMedia & { status: string; deletedAt: Date | null }) | null;
};

export async function SpatialHero({
  block,
  departments,
  campaignImage,
  locale,
  marketCode,
  first,
}: {
  block: Extract<HomepageBlock, { type: "Hero" }>;
  departments: HeroDepartment[];
  campaignImage?: ResponsiveImageMedia;
  locale: Locale;
  marketCode: string;
  first: boolean;
}) {
  const t = await getTranslations("shopping");
  return (
    <SpatialHeroView
      title={localizedValue(block.title, locale)}
      body={localizedValue(block.body, locale)}
      ctaLabel={localizedValue(block.ctaLabel, locale)}
      ctaHref={block.ctaUrl ? storefrontHref(block.ctaUrl, locale) : undefined}
      departments={departments.map((d) => ({
        id: d.id,
        label: localizedValue(d.titleI18n as Record<Locale, string>, locale),
        href: seoPath(
          locale,
          marketCode,
          "c",
          localizedValue(d.slugI18n as Record<Locale, string>, locale),
        ),
        media:
          d.media?.status === "READY" && !d.media.deletedAt
            ? d.media
            : undefined,
      }))}
      campaignImage={campaignImage}
      locale={locale}
      first={first}
      demoLabel={t("demoImage")}
    />
  );
}
