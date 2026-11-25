import type { CSSProperties } from "react";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";
import type { EditorialLocale } from "@/modules/editorial/contracts";

export function EditorialImage({
  desktop,
  mobile,
  focal,
  locale,
  priority,
}: {
  desktop?: ResponsiveImageMedia;
  mobile?: ResponsiveImageMedia;
  focal?: { x: number; y: number };
  locale: EditorialLocale;
  priority?: boolean;
}) {
  if (!desktop && !mobile) return null;
  const sizes = "(max-width: 760px) 100vw, (max-width: 1100px) 55vw, 740px";
  return (
    <div
      className="editorial-image"
      style={
        focal
          ? ({
              "--editorial-focal": `${focal.x * 100}% ${focal.y * 100}%`,
            } as CSSProperties)
          : undefined
      }
    >
      {desktop && (
        <ResponsiveImage
          media={desktop}
          locale={locale}
          sizes={sizes}
          className={mobile ? "editorial-desktop-image" : undefined}
          priority={priority}
        />
      )}
      {mobile && (
        <ResponsiveImage
          media={mobile}
          locale={locale}
          sizes={sizes}
          className={desktop ? "editorial-mobile-image" : undefined}
          priority={priority}
        />
      )}
    </div>
  );
}
