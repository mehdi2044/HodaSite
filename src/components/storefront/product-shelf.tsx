import Link from "next/link";
import type { ReactNode } from "react";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";

/** CMS category sources gain an editorial shelf; catalog and price logic stay upstream. */
export function ProductShelf({
  title,
  ordinal,
  locale,
  department,
  browseHref,
  browseLabel,
  emptyLabel,
  empty,
  children,
}: {
  title: string;
  ordinal: number;
  locale: "fa" | "tr" | "en";
  department?: { id: string; media?: ResponsiveImageMedia | null };
  browseHref?: string;
  browseLabel: string;
  emptyLabel: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`shell shop-home-section ${department ? "shop-department-shelf" : ""}`}
      data-testid="home-product-strip"
      data-department-id={department?.id}
      aria-label={title}
    >
      <div className="shop-shelf-heading">
        {department?.media && (
          <ResponsiveImage
            media={department.media}
            locale={locale}
            role="editorial"
            sizes="(min-width:768px) 100px, 72px"
            className="shop-shelf-portrait"
          />
        )}
        <div className="shop-shelf-title">
          <span className="shop-section-number" aria-hidden="true">
            {String(ordinal).padStart(2, "0")}
          </span>
          <h2>{title}</h2>
        </div>
        {browseHref && (
          <Link className="shop-section-link" href={browseHref}>
            {browseLabel}
          </Link>
        )}
      </div>
      {empty ? (
        <p className="shop-inline-empty">{emptyLabel}</p>
      ) : (
        <div
          className="shop-product-rail"
          role="region"
          aria-label={title}
          tabIndex={department ? 0 : undefined}
        >
          {children}
        </div>
      )}
    </section>
  );
}
