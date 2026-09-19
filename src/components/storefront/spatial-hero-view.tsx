import Link from "next/link";
import {
  ResponsiveImage,
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";

export type SpatialDepartment = {
  id: string;
  label: string;
  href: string;
  media?: ResponsiveImageMedia;
};

/** Editorial composition; all content, images and destinations come from the CMS. */
export function SpatialHeroView({
  title,
  body,
  ctaLabel,
  ctaHref,
  departments,
  campaignImage,
  locale,
  first,
  demoLabel,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref?: string;
  departments: SpatialDepartment[];
  campaignImage?: ResponsiveImageMedia;
  locale: "fa" | "tr" | "en";
  first: boolean;
  demoLabel: string;
}) {
  const Heading = first ? "h1" : "h2";
  const lines = title
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // Longer merchant copy flows naturally instead of clipping or overlapping controls.
  const displayTitle =
    lines.length === 3 &&
    lines.every((line) => line.length <= (locale === "fa" ? 14 : 11));
  const mainImage = campaignImage ?? departments[0]?.media;
  return (
    <section
      className="spatial-storefront"
      data-testid="storefront-hero"
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      <div
        className={`spatial-composition ${displayTitle ? "spatial-display-title" : "spatial-flow-title"}`}
      >
        <div className="spatial-frames" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="spatial-departments" data-testid="hero-departments">
          {departments.slice(0, 4).map((department, index) => {
            const media = index === 0 ? mainImage : department.media;
            return (
              <Link
                key={department.id}
                href={department.href}
                aria-label={department.label}
                className={`spatial-department spatial-plane-${index + 1}`}
              >
                {media ? (
                  <ResponsiveImage
                    media={media}
                    locale={locale}
                    role="editorial"
                    sizes={
                      index === 0
                        ? "(min-width:768px) 46vw, 66vw"
                        : "(min-width:768px) 18vw, 27vw"
                    }
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
                  <span aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{department.label}</span>
                  <span aria-hidden="true">↗</span>
                </span>
              </Link>
            );
          })}
        </div>
        <div className="spatial-copy">
          <p className="spatial-eyebrow">{body}</p>
          <Heading aria-label={title.replace(/\s+/g, " ")}>
            {displayTitle
              ? lines.map((line, index) =>
                  index === 1 ? (
                    <em key={index}>{line}</em>
                  ) : (
                    <span key={index}>{line}</span>
                  ),
                )
              : title}
          </Heading>
          {ctaHref && ctaLabel && (
            <Link href={ctaHref} className="spatial-cta">
              {ctaLabel}
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </div>
      <div className="spatial-caption shell">
        <p>{departments.map((d) => d.label).join(" / ")}</p>
        {(isDemoFashionMedia(mainImage) ||
          departments.some((d) => isDemoFashionMedia(d.media))) && (
          <p className="spatial-demo">{demoLabel}</p>
        )}
      </div>
    </section>
  );
}
