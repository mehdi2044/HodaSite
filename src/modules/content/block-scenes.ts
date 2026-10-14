import { shoppableSceneSchema, type ShoppableScene } from "./scenes/contracts";
/** Trusted parsed CMS trees only; preserves non-scene fields and block metadata. */
export function mapBlockScenes<T>(
  value: T,
  map: (scene: ShoppableScene) => ShoppableScene,
): T {
  if (Array.isArray(value))
    return value.map((item) => mapBlockScenes(item, map)) as T;
  if (!value || typeof value !== "object") return value;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version === 1 &&
    (candidate.mode === "PHOTO" || candidate.mode === "COMPOSITE") &&
    "pieces" in candidate
  )
    return map(shoppableSceneSchema.parse(value)) as T;
  return Object.fromEntries(
    Object.entries(candidate).map(([key, item]) => [
      key,
      mapBlockScenes(item, map),
    ]),
  ) as T;
}
export function blockScenes(value: unknown) {
  const scenes: ShoppableScene[] = [];
  mapBlockScenes(value, (scene) => {
    scenes.push(scene);
    return scene;
  });
  return scenes;
}

/** Only an actual video block can bind filmed pixels into its scene consent. */
export function bindBlockVideoScenes<T extends { type: string }>(
  blocks: T[],
): T[] {
  return blocks.map((block) => {
    const clean = mapBlockScenes(block, (scene) => ({
      ...scene,
      relatedVideoMediaId: undefined,
    }));
    const video = clean as T & {
      videoMediaId?: string;
      scene?: ShoppableScene;
    };
    return video.type === "VideoBanner" && video.scene && video.videoMediaId
      ? {
          ...clean,
          scene: { ...video.scene, relatedVideoMediaId: video.videoMediaId },
        }
      : clean;
  });
}
