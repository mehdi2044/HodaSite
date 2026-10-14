export const SCENE_ASPECTS = ["3:2", "4:5", "1:1", "16:9", "3:4"] as const;
export type SceneAspect = (typeof SCENE_ASPECTS)[number];
export function scenePointInFrame(
  point: { x: number; y: number },
  image: { width: number; height: number },
  frame: {
    aspect: SceneAspect;
    fit: "cover" | "contain";
    focal: { x: number; y: number };
  },
) {
  const [width, height] = frame.aspect.split(":").map(Number);
  if (!(image.width > 0 && image.height > 0))
    return { x: 0, y: 0, visible: false };
  const scale =
    frame.fit === "cover"
      ? Math.max(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height);
  const renderedWidth = image.width * scale,
    renderedHeight = image.height * scale;
  const x =
    ((width - renderedWidth) * frame.focal.x + point.x * renderedWidth) / width;
  const y =
    ((height - renderedHeight) * frame.focal.y + point.y * renderedHeight) /
    height;
  return { x, y, visible: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}
