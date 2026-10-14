import { describe, it, expect } from "vitest";
import {
  shoppableSceneSchema,
  SCENE_PIECE_LIMIT,
} from "@/modules/content/scenes/contracts";
import { scenePointInFrame } from "@/modules/content/scenes/geometry";
import { scenePriceRange } from "@/modules/content/scenes/resolve";
const text = { fa: "صحنه", tr: "Sahne", en: "Scene" };
const piece = {
  id: "piece",
  productId: "product",
  colorId: "color",
  referenceMediaId: "image",
  desktop: { x: 0.5, y: 0.5 },
  mobile: { x: 0.5, y: 0.5 },
};
const scene = {
  version: 1,
  id: "scene",
  mode: "PHOTO",
  title: text,
  alt: text,
  desktop: { mediaId: "image" },
  mobile: { mediaId: "mobile" },
  pieces: [piece],
};
describe("shared shoppable scene contracts and precise image/price projection", () => {
  it("accepts twelve promotional pieces independently of the fitting limit", () => {
    const pieces = Array.from({ length: SCENE_PIECE_LIMIT }, (_, n) => ({
      ...piece,
      id: `piece-${n}`,
      productId: `product-${n}`,
    }));
    expect(
      shoppableSceneSchema.parse({ ...scene, pieces }).pieces,
    ).toHaveLength(12);
    expect(
      shoppableSceneSchema.safeParse({
        ...scene,
        pieces: [...pieces, { ...piece, id: "thirteenth" }],
      }).success,
    ).toBe(false);
  });
  it("rejects unknown amounts/CSS, duplicate identities and out-of-bounds anchors", () => {
    for (const invalid of [
      { ...scene, amount: "10" },
      { ...scene, pieces: [piece, piece] },
      { ...scene, pieces: [{ ...piece, mobile: { x: 2, y: 0.5 } }] },
      {
        ...scene,
        desktop: { mediaId: "image", fit: "url(https://example.com)" },
      },
    ])
      expect(shoppableSceneSchema.safeParse(invalid).success).toBe(false);
  });
  it("maps contain letterboxing and cover focal crop without mirroring physical photo coordinates", () => {
    const image = { width: 100, height: 200 };
    expect(
      scenePointInFrame({ x: 0, y: 0.5 }, image, {
        aspect: "1:1",
        fit: "contain",
        focal: { x: 0.5, y: 0.5 },
      }),
    ).toEqual({ x: 0.25, y: 0.5, visible: true });
    expect(
      scenePointInFrame({ x: 0.5, y: 0 }, image, {
        aspect: "1:1",
        fit: "cover",
        focal: { x: 0.5, y: 0.5 },
      }),
    ).toEqual({ x: 0.5, y: -0.5, visible: false });
    expect(
      scenePointInFrame({ x: 0.5, y: 0 }, image, {
        aspect: "1:1",
        fit: "cover",
        focal: { x: 0.5, y: 0 },
      }),
    ).toEqual({ x: 0.5, y: 0, visible: true });
  });
  it("retains numeric(18,4) exactness for variant ranges and does not invent a price", () => {
    expect(
      scenePriceRange(["99999999999999.9999", "99999999999999.9998"]),
    ).toEqual({ min: "99999999999999.9998", max: "99999999999999.9999" });
    expect(scenePriceRange(["0.0001", "0.0001"])).toEqual({
      min: "0.0001",
      max: "0.0001",
    });
    expect(scenePriceRange([])).toBeNull();
  });
});
