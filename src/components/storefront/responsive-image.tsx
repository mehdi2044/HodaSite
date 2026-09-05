import type { MediaVariants } from "@/modules/media/constants";

export type ResponsiveImageMedia = {
  url: string;
  variants: unknown;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
  altI18n: unknown;
};

function srcSet(byWidth: MediaVariants[keyof MediaVariants]): string {
  return Object.entries(byWidth ?? {})
    .map(([width, v]) => `${v!.url} ${width}w`)
    .join(", ");
}

/**
 * Storefront's one and only way to render a Media image (Phase 01b §5):
 * `<picture>` with avif -> webp -> original fallback, `srcset` from
 * `variants`, `width`/`height` to avoid layout shift, and the blur
 * placeholder as a CSS background behind the `<img>` — once the (opaque)
 * image paints it simply covers the blur, no onLoad/JS needed.
 */
export function ResponsiveImage({
  media,
  locale,
  sizes,
  priority,
  className,
  imgClassName = "h-full w-full object-cover",
}: {
  media: ResponsiveImageMedia;
  locale: "fa" | "tr" | "en";
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Defaults to filling the wrapper (grid tiles); pass e.g.
   *  "h-8 w-auto object-contain" for intrinsic-sized logos. */
  imgClassName?: string;
}) {
  const variants = (media.variants as MediaVariants | null) ?? {};
  const alt =
    (media.altI18n as Record<string, string> | null)?.[locale] ??
    (media.altI18n as Record<string, string> | null)?.en ??
    "";

  const webpEntries = Object.entries(variants.webp ?? {}).sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  const largestWebp = webpEntries.at(-1)?.[1]?.url ?? media.url;

  return (
    <picture
      style={
        media.blurDataUrl
          ? {
              backgroundImage: `url(${media.blurDataUrl})`,
              backgroundSize: "cover",
            }
          : undefined
      }
      className={className}
    >
      {variants.avif && (
        <source
          type="image/avif"
          srcSet={srcSet(variants.avif)}
          sizes={sizes}
        />
      )}
      {variants.webp && (
        <source
          type="image/webp"
          srcSet={srcSet(variants.webp)}
          sizes={sizes}
        />
      )}
      <img
        src={largestWebp}
        alt={alt}
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        className={imgClassName}
      />
    </picture>
  );
}
