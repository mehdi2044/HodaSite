import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import { storefrontHref } from "@/modules/content/storefront-links";
import { localizedValue, type HomepageBlock } from "@/modules/content/homepage";
import {
  ResponsiveImage,
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";
type Locale = "fa" | "tr" | "en";
export type HeroDepartment = {
  id: string;
  titleI18n: unknown;
  slugI18n: unknown;
  media:
    (ResponsiveImageMedia & { status: string; deletedAt: Date | null }) | null;
};

/** Adapted from Lovable's spatial art direction, backed by real catalog routes. */
export async function SpatialHero({
  block,
  departments,
  locale,
  marketCode,
  first,
}: {
  block: Extract<HomepageBlock, { type: "Hero" }>;
  departments: HeroDepartment[];
  locale: Locale;
  marketCode: string;
  first: boolean;
}) {
  const t = await getTranslations("shopping");
  const Heading = first ? "h1" : "h2";
  return (
    <section className="spatial-storefront" data-testid="storefront-hero">
      <div className="shell spatial-composition">
        <div className="spatial-copy">
          <p className="spatial-eyebrow">
            {departments
              .map((d) =>
                localizedValue(d.titleI18n as Record<Locale, string>, locale),
              )
              .join(" / ")}
          </p>
          <Heading>{localizedValue(block.title, locale)}</Heading>
          <p className="spatial-description">
            {localizedValue(block.body, locale)}
          </p>
          {block.ctaUrl && localizedValue(block.ctaLabel, locale) && (
            <Link
              className="button spatial-cta"
              href={storefrontHref(block.ctaUrl, locale)}
            >
              {localizedValue(block.ctaLabel, locale)}
              <span aria-hidden="true">↗</span>
            </Link>
          )}
        </div>
        <div className="spatial-planes">
          <div className="spatial-frames" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="spatial-departments" data-testid="hero-departments">
            {departments.map((department, index) => {
              const label = localizedValue(
                department.titleI18n as Record<Locale, string>,
                locale,
              );
              const media =
                department.media?.status === "READY" &&
                !department.media.deletedAt
                  ? department.media
                  : null;
              return (
                <Link
                  className="spatial-department"
                  aria-label={label}
                  key={department.id}
                  href={seoPath(
                    locale,
                    marketCode,
                    "c",
                    localizedValue(
                      department.slugI18n as Record<Locale, string>,
                      locale,
                    ),
                  )}
                >
                  {media ? (
                    <ResponsiveImage
                      media={media}
                      locale={locale}
                      role="editorial"
                      sizes="(min-width:1024px) 22vw, 45vw"
                      priority={first && index === 0}
                      className="spatial-department-image"
                    />
                  ) : (
                    <span
                      className="spatial-image-placeholder"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span className="spatial-department-label">
                    <span>{label}</span>
                    <span aria-hidden="true">↗</span>
                  </span>
                </Link>
              );
            })}
          </div>
          {departments.some((d) =>
            isDemoFashionMedia(d.media ?? undefined),
          ) && <p className="spatial-demo">{t("demoImage")}</p>}
        </div>
      </div>
    </section>
  );
}
