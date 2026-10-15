import {
  ResponsiveImage,
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";

export function CategoryPortrait({
  media,
  locale,
  demoLabel,
}: {
  media: ResponsiveImageMedia;
  locale: "fa" | "tr" | "en";
  demoLabel: string;
}) {
  return (
    <figure className="shop-category-artwork">
      <ResponsiveImage
        media={media}
        locale={locale}
        role="editorial"
        sizes="(min-width:768px) 180px, 88px"
        className="shop-category-portrait"
      />
      {isDemoFashionMedia(media) && (
        <figcaption className="shop-demo-caption mt-3">{demoLabel}</figcaption>
      )}
    </figure>
  );
}
