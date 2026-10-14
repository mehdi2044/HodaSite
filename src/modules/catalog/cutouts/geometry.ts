import type { CutoutPlacement } from "./contracts";
import {
  scenePointInFrame,
  type SceneAspect,
} from "@/modules/content/scenes/geometry";
export function projectCutout(
  placement: CutoutPlacement,
  image: { width: number; height: number },
  frame: {
    aspect: SceneAspect;
    fit: "contain" | "cover";
    focal: { x: number; y: number };
  },
) {
  const center = scenePointInFrame(placement, image, frame);
  const [width, height] = frame.aspect.split(":").map(Number);
  if (!(image.width > 0 && image.height > 0)) return null;
  const scale =
    frame.fit === "contain"
      ? Math.min(width / image.width, height / image.height)
      : Math.max(width / image.width, height / image.height);
  return {
    x: center.x,
    y: center.y,
    visible: center.visible,
    width: (placement.width * placement.scale * image.width * scale) / width,
    height:
      (placement.height * placement.scale * image.height * scale) / height,
    rotation: placement.rotation,
    zIndex: placement.zIndex,
  };
}
