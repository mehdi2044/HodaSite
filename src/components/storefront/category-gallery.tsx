import Link from "next/link";
import {
  ResponsiveImage,
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";

/** Navigation uses a magazine composition; product shelves keep their shopping grid. */
export function CategoryGallery({
  title,
  ordinal,
  locale,
  intro,
  browseLabel,
  demoLabel,
  emptyLabel,
  categories,
}: {
  title: string;
  ordinal: number;
  locale: "fa" | "tr" | "en";
  intro: string;
  browseLabel: string;
  demoLabel: string;
  emptyLabel: string;
  categories: Array<{
    id: string;
    title: string;
    href: string;
    media?: ResponsiveImageMedia;
  }>;
}) {
  const number = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 });
  return (
    <section
      className="shell shop-home-section shop-category-section"
      data-testid="home-categories"
    >
      <div className="shop-discovery-heading">
        <div>
          <p className="shop-discovery-intro">{intro}</p>
          <h2>{title}</h2>
        </div>
        <span className="shop-discovery-index" aria-hidden="true">
          {number.format(ordinal)}
        </span>
      </div>
      {!categories.length && <p className="shop-inline-empty">{emptyLabel}</p>}
      <div
        className={`shop-discovery-grid ${categories.length >= 4 ? "shop-discovery-mosaic" : ""}`}
      >
        {categories.map((category, index) => (
          <Link
            className="shop-discovery-card"
            key={category.id}
            href={category.href}
            aria-label={category.title}
            data-has-image={Boolean(category.media)}
          >
            {category.media && (
              <ResponsiveImage
                media={category.media}
                locale={locale}
                role="editorial"
                sizes="(max-width:767px) 50vw, (max-width:1279px) 50vw, 660px"
                className="shop-discovery-image"
              />
            )}
            <span className="shop-discovery-number" aria-hidden="true">
              {number.format(index + 1)}
            </span>
            {isDemoFashionMedia(category.media) && (
              <span className="shop-discovery-demo">{demoLabel}</span>
            )}
            <div className="shop-discovery-caption">
              <h3>{category.title}</h3>
              <span className="shop-discovery-cta">
                {browseLabel}
                <span className="shop-discovery-arrow" aria-hidden="true">
                  ↗
                </span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
