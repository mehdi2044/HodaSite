import { ResponsiveImage } from "./responsive-image";
import type { SceneLayer } from "@/modules/content/scenes/resolve";
import { projectCutout } from "@/modules/catalog/cutouts/geometry";
import type { ShoppableScene } from "@/modules/content/scenes/contracts";
export function SceneLayerImage({
  layer,
  model,
  frame,
  locale,
  pieceId,
}: {
  pieceId?: string;
  layer: SceneLayer;
  model: { width: number | null; height: number | null };
  frame: ShoppableScene["desktop"];
  locale: "fa" | "tr" | "en";
}) {
  const projected = projectCutout(
    layer.geometry,
    { width: model.width ?? 0, height: model.height ?? 0 },
    frame,
  );
  if (!projected) return null;
  return (
    <div
      data-scene-layer="true"
      data-fitting-piece-target={pieceId}
      data-fitting-rotation={layer.geometry.rotation}
      aria-hidden="true"
      style={{
        position: "absolute",
        pointerEvents: "none",
        left: `${projected.x * 100}%`,
        top: `${projected.y * 100}%`,
        width: `${projected.width * 100}%`,
        height: `${projected.height * 100}%`,
        zIndex: projected.zIndex + 21,
        transform: `translate(-50%, -50%) rotate(${projected.rotation}deg)`,
      }}
    >
      <ResponsiveImage
        media={{
          ...layer.media,
          altI18n: {},
          presentation: { fit: "contain", focalX: 0.5, focalY: 0.5 },
        }}
        locale={locale}
        sizes="(min-width:1024px) 50vw,80vw"
        className="block h-full w-full"
        imgClassName="h-full w-full"
      />
    </div>
  );
}
