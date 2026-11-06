import type { CutoutPlacement } from "./contracts";

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
const accessory = {
  "seed-moda4-profile-accessories-cap": {
    point: "head",
    originY: 0.78,
    adultWidth: 66,
    childWidth: 59,
    zIndex: 8,
  },
  "seed-moda4-profile-accessories-scarf": {
    point: "neck",
    originY: 0.16,
    adultWidth: 103,
    childWidth: 73,
    zIndex: 6,
  },
  "seed-moda4-profile-accessories-bag": {
    point: "hands",
    originY: 0.1,
    adultWidth: 72,
    childWidth: 56,
    zIndex: 7,
  },
} as const;

export function instantPlacement(
  placement: CutoutPlacement,
  profile: { id: string; version: number },
  model: {
    id: string;
    mediaId: string;
    width: number | null;
    height: number | null;
  },
) {
  const preset = accessory[profile.id as keyof typeof accessory];
  const rig = rigs[model.id as DemoRig];
  if (
    !preset ||
    !rig ||
    profile.version !== 1 ||
    model.mediaId !== `seed-moda4-mannequin-${model.id}` ||
    model.width !== 420 ||
    model.height !== 560
  )
    return placement;

  const child = model.id === "girl" || model.id === "boy";
  const [x, y] = preset.point === "hands" ? rig.hands[1] : rig[preset.point];
  const width = (child ? preset.childWidth : preset.adultWidth) / 420;
  const height = (placement.height * width) / placement.width;
  return {
    ...placement,
    x: x / 420,
    y: y / 560 + height * (0.5 - preset.originY),
    width,
    height,
    scale: 1,
    rotation: 0,
    zIndex: preset.zIndex,
  };
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
