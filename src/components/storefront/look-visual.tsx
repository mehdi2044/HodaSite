import type {
  EditorialLocale,
  LookContent,
} from "@/modules/editorial/contracts";
import type { LookVisual } from "@/modules/editorial/visual";
import { EditorialImage } from "./editorial-image";
import { ResponsiveImage } from "./responsive-image";

export function LookComposition({
  visual,
  locale,
  label,
}: {
  visual: LookVisual;
  locale: EditorialLocale;
  label: string;
}) {
  if (visual.pieces.some(({ image }) => !image)) return null;
  return (
    <figure className="look-composition">
      <div className="look-composition-pieces">
        {visual.pieces.map(
          ({ image, variantId }) =>
            image && (
              <ResponsiveImage
                key={variantId}
                media={image}
                locale={locale}
                sizes="(max-width: 680px) 24vw, 170px"
                imgClassName="h-full w-full object-contain"
              />
            ),
        )}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function LookArtwork({
  body,
  visual,
  locale,
  label,
  priority,
  frame,
}: {
  body: LookContent;
  visual: LookVisual;
  locale: EditorialLocale;
  label: string;
  priority?: boolean;
  frame?: "portrait" | "wide";
}) {
  return visual.mode === "COMPOSITE" ? (
    <LookComposition visual={visual} locale={locale} label={label} />
  ) : (
    <EditorialImage
      desktop={
        frame === "portrait"
          ? (visual.mobile ?? visual.desktop)
          : visual.desktop
      }
      mobile={frame ? undefined : visual.mobile}
      focal={body.focal}
      locale={locale}
      priority={priority}
    />
  );
}
