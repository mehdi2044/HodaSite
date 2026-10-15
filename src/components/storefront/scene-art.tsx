import { ResponsiveImage } from "./responsive-image";
import { SceneLayerImage } from "./scene-layer";
import type { SceneView } from "@/modules/content/scenes/resolve";
export function SceneArt({
  view,
  locale,
  sketch = false,
}: {
  sketch?: boolean;
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
      {sketch && (
        <svg
          className="moda-fitting-sketch"
          viewBox="0 0 220 560"
          aria-hidden="true"
        >
          <g
            fill="var(--surface)"
            stroke="var(--text)"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <ellipse cx="110" cy="48" rx="30" ry="36" />
            <path d="M98 82h24l2 20H96z" />
            <path d="M62 112c14-12 32-12 48-12s34 0 48 12l14 104c-6 6-14 6-20 0l-8-60-4 78c4 22 6 44 6 64H70c0-20 2-42 6-64l-4-78-8 60c-6 6-14 6-20 0z" />
            <path d="M72 300h76l-6 236h-24l-8-196-8 196H78z" />
          </g>
          <path
            d="M110 536v14M70 552h80"
            stroke="var(--text)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {current.media && (
        <div className="moda-scene-base">
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
        </div>
      )}
      {view.mode === "COMPOSITE" &&
        current.media &&
        view.pieces.map((piece) =>
          piece.layer ? (
            <SceneLayerImage
              key={piece.id}
              layer={piece.layer}
              pieceId={piece.id}
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
