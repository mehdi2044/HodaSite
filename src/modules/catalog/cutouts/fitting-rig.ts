import type {
  CUTOUT_ANCHORS,
  CUTOUT_SLOTS,
  CutoutPlacement,
} from "./contracts";

type Point = readonly [number, number];

/** Landmarks measured on the four supplied 420×560 model images. Coordinates
 * are in the model artwork, independently of the stage size or writing direction. */
const rigs = {
  woman: {
    head: [210, 46],
    neck: [210, 93],
    shoulders: [
      [163, 112],
      [257, 112],
    ],
    hands: [
      [151, 216],
      [268, 216],
    ],
    waist: [210, 264],
    feet: [
      [188, 534],
      [232, 534],
    ],
  },
  man: {
    head: [210, 45],
    neck: [210, 93],
    shoulders: [
      [152, 112],
      [268, 112],
    ],
    hands: [
      [142, 225],
      [278, 225],
    ],
    waist: [210, 268],
    feet: [
      [188, 534],
      [232, 534],
    ],
  },
  girl: {
    head: [210, 185],
    neck: [210, 230],
    shoulders: [
      [174, 244],
      [246, 244],
    ],
    hands: [
      [168, 329],
      [252, 329],
    ],
    waist: [210, 317],
    feet: [
      [194, 532],
      [226, 532],
    ],
  },
  boy: {
    head: [210, 177],
    neck: [210, 223],
    shoulders: [
      [170, 237],
      [250, 237],
    ],
    hands: [
      [164, 327],
      [256, 327],
    ],
    waist: [210, 317],
    feet: [
      [195, 532],
      [225, 532],
    ],
  },
} satisfies Record<
  string,
  {
    head: Point;
    neck: Point;
    shoulders: [Point, Point];
    hands: [Point, Point];
    waist: Point;
    feet: [Point, Point];
  }
>;

type DemoRig = keyof typeof rigs;
const anchors = {
  HEAD: { point: "head", pivot: 0.78, width: [66, 59], layer: 8 },
  NECK: { point: "neck", pivot: 0.16, width: [103, 73], layer: 6 },
  HAND: { point: "hands", pivot: 0.1, width: [72, 56], layer: 7 },
  TOP: { point: "shoulders", pivot: 0.14, width: [140, 96], layer: 2 },
  BOTTOM: { point: "waist", pivot: 0.05, width: [116, 80], layer: 1 },
  ONE_PIECE: { point: "shoulders", pivot: 0.12, width: [151, 102], layer: 3 },
  LAYER: { point: "shoulders", pivot: 0.12, width: [165, 112], layer: 5 },
  SHOES: { point: "feet", pivot: 0.68, width: [90, 64], layer: 2 },
} as const;

type ModelArt = {
  id: string;
  mediaId: string;
  width: number | null;
  height: number | null;
};
type CutoutRole = {
  slot: (typeof CUTOUT_SLOTS)[number];
  anchor: (typeof CUTOUT_ANCHORS)[number] | null;
};
const knownRig = (model: ModelArt) => {
  if (model.width !== 420 || model.height !== 560) return;
  return (Object.keys(rigs) as DemoRig[]).find(
    (key) => model.mediaId === `seed-moda4-mannequin-${key}`,
  );
};

export function suggestFittingPlacement(
  role: CutoutRole,
  model: ModelArt,
  image: { width: number | null; height: number | null },
): CutoutPlacement | null {
  const key = knownRig(model);
  const target = role.slot === "ACCESSORY" ? role.anchor : role.slot;
  if (!key || !target || !image.width || !image.height) return null;
  const rig = rigs[key],
    preset = anchors[target];
  const pair =
    preset.point === "shoulders" || preset.point === "feet"
      ? rig[preset.point]
      : null;
  const [x, y] = pair
    ? [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2]
    : preset.point === "hands"
      ? rig.hands[1]
      : preset.point === "head" || preset.point === "neck"
        ? rig[preset.point]
        : rig.waist;
  const w = preset.width[key === "girl" || key === "boy" ? 1 : 0];
  const height = (w * image.height) / image.width / 560;
  const center = y / 560 + height * (0.5 - preset.pivot);
  if (height < 0.01 || height > 1.5 || center < 0 || center > 1) return null;
  return {
    modelId: model.id,
    x: x / 420,
    y: center,
    width: w / 420,
    height,
    scale: 1,
    rotation: 0,
    zIndex: preset.layer,
  };
}

/** Version zero predates the editor's first save. Only already validated legacy
 * accessories on known artwork get a preset. Merchant saves remain authoritative. */
export function instantPlacement(
  placement: CutoutPlacement,
  profile: { version: number; slot: string; anchor: string | null },
  model: ModelArt,
) {
  if (
    profile.version !== 0 ||
    profile.slot !== "ACCESSORY" ||
    (profile.anchor !== "HEAD" &&
      profile.anchor !== "NECK" &&
      profile.anchor !== "HAND")
  )
    return placement;
  const aligned = suggestFittingPlacement(
    { slot: "ACCESSORY", anchor: profile.anchor },
    model,
    { width: placement.width * 420, height: placement.height * 560 },
  );
  return aligned ? { ...placement, ...aligned } : placement;
}

export const cutoutViewForYaw = (yaw: number) =>
  yaw <= -22 ? "left" : yaw >= 22 ? "right" : "front";

export function cutoutPlacementForView(
  placement: CutoutPlacement,
  view: "front" | "left" | "right",
) {
  return view === "front"
    ? placement
    : { ...placement, ...placement.views?.[view] };
}

export function cutoutClip(placement: CutoutPlacement) {
  const mask = placement.mask;
  return mask
    ? `inset(${mask.top * 100}% 0 ${mask.bottom * 100}% 0)`
    : undefined;
}
