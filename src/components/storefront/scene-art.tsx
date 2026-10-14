import { ResponsiveImage } from "./responsive-image";
import { SceneLayerImage } from "./scene-layer";
import type { SceneView } from "@/modules/content/scenes/resolve";
export function SceneArt({
  view,
  locale,
}: {
  view: SceneView;
  locale: "fa" | "tr" | "en";
}) {
  const current = view.mobile.media ? view.mobile : view.desktop;
  const frame = {
    ...current.frame,
    aspect: "3:4" as const,
    fit: "contain" as const,
  };
  return (
    <figure className="moda-scene-art" aria-label={view.alt}>
      {current.media && (
        <ResponsiveImage
          media={{
            ...current.media,
            altI18n: { [locale]: view.alt },
            presentation: { fit: "contain", focalX: 0.5, focalY: 0.5 },
          }}
          locale={locale}
          sizes="330px"
          imgClassName="h-full w-full"
        />
      )}
      {view.mode === "COMPOSITE" &&
        current.media &&
        view.pieces.map((piece) =>
          piece.layer ? (
            <SceneLayerImage
              key={piece.id}
              layer={piece.layer}
              model={current.media!}
              frame={frame}
              locale={locale}
            />
          ) : null,
        )}
      <figcaption>{view.title}</figcaption>
    </figure>
  );
}
