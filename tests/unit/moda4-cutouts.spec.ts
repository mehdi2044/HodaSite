import { describe, it, expect } from "vitest";
import {
  CUTOUT_SLOTS,
  MODEL_KINDS,
  placementSchema,
  cutoutInputSchema,
  validCompositionSlots,
} from "@/modules/catalog/cutouts/contracts";
import { projectCutout } from "@/modules/catalog/cutouts/geometry";
const item = { modelId: "woman", x: 0.5, y: 0.5, width: 0.3, height: 0.4 };
describe("real cutout geometry and styling slots", () => {
  it("supports all four model kinds, all six slots and independently placed accessories", () => {
    expect(MODEL_KINDS).toEqual(["WOMAN", "MAN", "GIRL", "BOY"]);
    expect(CUTOUT_SLOTS).toContain("SHOES");
    expect(
      validCompositionSlots([
        { slot: "ONE_PIECE", anchor: null },
        { slot: "SHOES", anchor: null },
        { slot: "ACCESSORY", anchor: "HEAD" },
        { slot: "ACCESSORY", anchor: "NECK" },
      ]),
    ).toBe(true);
    expect(
      validCompositionSlots([
        { slot: "ACCESSORY", anchor: "HAND" },
        { slot: "ACCESSORY", anchor: "HAND" },
      ]),
    ).toBe(false);
    expect(
      validCompositionSlots([
        { slot: "TOP", anchor: null },
        { slot: "ONE_PIECE", anchor: null },
      ]),
    ).toBe(false);
    expect(
      validCompositionSlots(
        Array.from({ length: 5 }, () => ({
          slot: "LAYER" as const,
          anchor: null,
        })),
      ),
    ).toBe(false);
    expect(
      validCompositionSlots([{ slot: "ACCESSORY", anchor: "EAR" as "HAND" }]),
    ).toBe(false);
  });
  it("rejects unbounded transforms, duplicate model entries and incorrect slot anchors", () => {
    for (const change of [
      { x: -1 },
      { scale: 100 },
      { rotation: 181 },
      { zIndex: 1.1 },
      { width: 0 },
    ])
      expect(placementSchema.safeParse({ ...item, ...change }).success).toBe(
        false,
      );
    const input = {
      productId: "product",
      colorId: "color",
      variantId: null,
      mediaId: "image",
      slot: "ACCESSORY",
      anchor: null,
      geometry: { version: 1, models: [item] },
      expectedVersion: 0,
      confirm: true,
      expectedImageFingerprint: "a".repeat(64),
      expectedModelFingerprints: [
        { modelId: "woman", fingerprint: "b".repeat(64) },
      ],
    };
    expect(cutoutInputSchema.safeParse(input).success).toBe(false);
    expect(
      cutoutInputSchema.safeParse({
        ...input,
        anchor: "HAND",
        geometry: { version: 1, models: [item, item] },
      }).success,
    ).toBe(false);
    expect(
      cutoutInputSchema.safeParse({ ...input, anchor: "HAND" }).success,
    ).toBe(true);
  });
  it("projects geometry through actual contain/cover without mirroring photo coordinates", () => {
    const placement = placementSchema.parse(item);
    const contained = projectCutout(
      placement,
      { width: 100, height: 200 },
      { aspect: "1:1", fit: "contain", focal: { x: 0.5, y: 0.5 } },
    );
    expect(contained).toMatchObject({
      x: 0.5,
      y: 0.5,
      width: 0.15,
      height: 0.4,
      visible: true,
    });
    const covered = projectCutout(
      { ...placement, x: 0 },
      { width: 200, height: 100 },
      { aspect: "1:1", fit: "cover", focal: { x: 1, y: 0.5 } },
    );
    expect(covered?.visible).toBe(false);
    expect(
      projectCutout(
        placement,
        { width: 0, height: 0 },
        { aspect: "1:1", fit: "contain", focal: { x: 0.5, y: 0.5 } },
      ),
    ).toBe(null);
  });
});
